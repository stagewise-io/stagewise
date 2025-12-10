import type { Logger } from '@/services/logger';
import type { ReactSelectedElementInfo } from '@shared/context-elements/react';

/**
 * Fetches and builds React component tree information from DOM elements.
 */
export class ReactComponentTracker {
  private cdpDebugger: Electron.Debugger;
  private logger: Logger;

  constructor(cdpDebugger: Electron.Debugger, logger: Logger) {
    this.cdpDebugger = cdpDebugger;
    this.logger = logger;
  }

  /**
   * Sends a CDP command and returns the result.
   */
  private async sendCommand(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.cdpDebugger.isAttached()) {
      throw new Error('Debugger not attached');
    }
    return this.cdpDebugger.sendCommand(method, params);
  }

  /**
   * Finds the React fiber for a given DOM element.
   * Returns the fiber object ID or null if not found.
   */
  private async findFiberForElement(objectId: string): Promise<string | null> {
    const fiberResult = (await this.sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() {
        const findFiber = (node) => {
          if (!node) return null;
          const props = Object.getOwnPropertyNames(node);
          for (const key of props) {
            if (key.startsWith('__reactFiber$')) return node[key] || null;
            if (key.startsWith('__reactInternalInstance$')) return node[key] || null;
          }
          const root = node._reactRootContainer;
          if (root?._internalRoot?.current) return root._internalRoot.current;
          return null;
        };
        let fiber = findFiber(this);
        if (fiber) return fiber;
        let current = this.parentElement;
        let depth = 0;
        while (current && depth < 5) {
          fiber = findFiber(current);
          if (fiber) return fiber;
          current = current.parentElement;
          depth++;
        }
        return null;
      }`,
      returnByValue: false,
    })) as { result?: { objectId?: string } };

    return fiberResult.result?.objectId || null;
  }

  /**
   * Serializes all relevant fiber nodes by walking up the fiber tree.
   * Extracts only serializable properties to avoid circular references.
   */
  private async serializeFiberTree(fiberObjectId: string): Promise<Array<{
    typeName?: string;
    typeDisplayName?: string;
    elementTypeName?: string;
    elementTypeDisplayName?: string;
    debugOwnerName?: string;
    debugOwnerEnv?: string;
  }> | null> {
    const result = (await this.sendCommand('Runtime.callFunctionOn', {
      objectId: fiberObjectId,
      functionDeclaration: `function() {
        const safeGet = (obj, path) => {
          try {
            const parts = path.split('.');
            let current = obj;
            for (const part of parts) {
              if (current == null) return undefined;
              current = current[part];
            }
            return current;
          } catch {
            return undefined;
          }
        };
        
        const extractTypeInfo = (type) => {
          if (!type) return { name: undefined, displayName: undefined };
          try {
            if (typeof type === 'function') {
              return {
                name: type.name || undefined,
                displayName: type.displayName || undefined,
              };
            }
            if (typeof type === 'object') {
              return {
                name: safeGet(type, 'name') || safeGet(type, 'render.name') || undefined,
                displayName: safeGet(type, 'displayName') || safeGet(type, 'render.displayName') || undefined,
              };
            }
          } catch {
            // Ignore errors when accessing properties
          }
          return { name: undefined, displayName: undefined };
        };
        
        const extractDebugOwner = (fiber) => {
          try {
            const owner = (fiber && (fiber._debugOwner || fiber.debugOwner)) || null;
            if (!owner) {
              return { name: undefined, env: undefined };
            }
            const name = typeof owner.name === 'string' ? owner.name : undefined;
            const env = typeof owner.env === 'string' ? owner.env : undefined;
            return {
              name: name || undefined,
              env: env || undefined,
            };
          } catch {
            return { name: undefined, env: undefined };
          }
        };
        
        const fibers = [];
        const visited = new WeakSet();
        let fiber = this;
        let count = 0;
        
        while (fiber && count < 30) {
          if (visited.has(fiber)) break;
          visited.add(fiber);
          
          try {
            const typeInfo = extractTypeInfo(fiber.type);
            const elementTypeInfo = extractTypeInfo(fiber.elementType);
            const debugOwner = extractDebugOwner(fiber);
            
            fibers.push({
              typeName: typeInfo.name,
              typeDisplayName: typeInfo.displayName,
              elementTypeName: elementTypeInfo.name,
              elementTypeDisplayName: elementTypeInfo.displayName,
              debugOwnerName: debugOwner.name,
              debugOwnerEnv: debugOwner.env,
            });
          } catch {
            // Skip this fiber if extraction fails
            fibers.push({
              typeName: undefined,
              typeDisplayName: undefined,
              elementTypeName: undefined,
              elementTypeDisplayName: undefined,
              debugOwnerName: undefined,
              debugOwnerEnv: undefined,
            });
          }
          
          fiber = fiber.return || null;
          count++;
        }
        
        return fibers;
      }`,
      returnByValue: true,
    })) as {
      result?: {
        value?: Array<{
          typeName?: string;
          typeDisplayName?: string;
          elementTypeName?: string;
          elementTypeDisplayName?: string;
          debugOwnerName?: string;
          debugOwnerEnv?: string;
        }>;
      };
    };

    return result.result?.value || null;
  }

  /**
   * Parses serialized fiber data in the main process to build component tree.
   */
  private parseFiberTree(
    fibers: Array<{
      typeName?: string;
      typeDisplayName?: string;
      elementTypeName?: string;
      elementTypeDisplayName?: string;
      debugOwnerName?: string;
      debugOwnerEnv?: string;
    }>,
  ): ReactSelectedElementInfo | null {
    const isRSCFiber = (fiber: {
      debugOwnerName?: string;
      debugOwnerEnv?: string;
    }): boolean => {
      const env = fiber.debugOwnerEnv;
      if (typeof env === 'string') {
        return env.toLowerCase() === 'server';
      }
      return false;
    };

    const isComponentFiber = (fiber: {
      typeName?: string;
      typeDisplayName?: string;
      debugOwnerName?: string;
      debugOwnerEnv?: string;
    }): boolean => {
      // Treat RSC fibers (Server Components) as components even if no element type
      // This matches the old implementation: isRSCFiber(fiber) && getDebugOwner(fiber)?.name
      if (isRSCFiber(fiber) && fiber.debugOwnerName) {
        return true;
      }

      // For non-RSC fibers, check if we have type info
      // typeName/typeDisplayName being undefined means type was null/undefined (HostRoot)
      // If we have type info, it's likely a component (not a string/host component)
      if (fiber.typeName || fiber.typeDisplayName) {
        // Has type info, likely a component
        return true;
      }

      // No type info and not RSC means HostRoot or similar - not a component
      return false;
    };

    const getDisplayNameForFiber = (fiber: {
      typeName?: string;
      typeDisplayName?: string;
      elementTypeName?: string;
      elementTypeDisplayName?: string;
      debugOwnerName?: string;
      debugOwnerEnv?: string;
    }): string => {
      // Prefer RSC naming
      if (isRSCFiber(fiber) && fiber.debugOwnerName) {
        return fiber.debugOwnerName;
      }
      // Try typeDisplayName first, then typeName
      if (fiber.typeDisplayName) {
        return fiber.typeDisplayName;
      }
      if (fiber.typeName) {
        return fiber.typeName;
      }
      // Fallback to elementType
      if (fiber.elementTypeDisplayName) {
        return fiber.elementTypeDisplayName;
      }
      if (fiber.elementTypeName) {
        return fiber.elementTypeName;
      }
      return 'Anonymous';
    };

    const isPrimitiveWrapperName = (name: string | undefined): boolean => {
      if (!name) return false;
      return String(name).toLowerCase().startsWith('primitive.');
    };

    const components: Array<{ name: string; isRSC: boolean }> = [];
    const seenRSCNames = new Set<string>();

    for (const fiber of fibers) {
      if (isComponentFiber(fiber)) {
        const displayName = getDisplayNameForFiber(fiber);
        if (!isPrimitiveWrapperName(displayName)) {
          const isRSC = isRSCFiber(fiber);
          // Skip duplicate RSC component names
          if (!(isRSC && seenRSCNames.has(displayName))) {
            components.push({
              name: displayName,
              isRSC,
            });
            if (isRSC) {
              seenRSCNames.add(displayName);
            }
          }
        }
      }
    }

    if (components.length === 0) {
      return null;
    }

    // Build nested hierarchy with nearest component at the top-level
    // (reverse order: components[0] is nearest, components[length-1] is root)
    let hierarchy: ReactSelectedElementInfo | null = null;
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i];
      if (!comp) continue;

      // Avoid same-name adjacency if both are RSC
      if (
        hierarchy &&
        comp.isRSC &&
        hierarchy.isRSC &&
        comp.name === hierarchy.componentName
      ) {
        continue;
      }

      hierarchy = {
        componentName: comp.name,
        serializedProps: {},
        isRSC: comp.isRSC,
        parent: hierarchy,
      };
    }

    return hierarchy;
  }

  /**
   * Fetches React component tree information for a given element.
   * Minimizes sandbox code by serializing fiber data and parsing in main process.
   *
   * @param objectId - The object ID from DOM.resolveNode (main world)
   * @returns React component tree or null if not found
   */
  async fetchReactInfo(
    objectId: string,
  ): Promise<ReactSelectedElementInfo | null> {
    try {
      // Step 1: Find the React fiber (minimal sandbox code)
      const fiberObjectId = await this.findFiberForElement(objectId);
      if (!fiberObjectId) {
        return null;
      }

      // Step 2: Serialize all relevant fiber nodes (minimal sandbox code)
      const serializedFibers = await this.serializeFiberTree(fiberObjectId);
      if (!serializedFibers || serializedFibers.length === 0) {
        return null;
      }

      // Step 3: Parse in main process (full control, better error handling)
      return this.parseFiberTree(serializedFibers);
    } catch (error) {
      this.logger.debug(
        `[ReactComponentTracker] Error fetching React info: ${error}`,
      );
      return null;
    }
  }
}
