import type { Logger } from '@/services/logger';
import type { ReactSelectedElementInfo } from '@shared/context-elements/react';

/**
 * Fetches and builds React component tree information from DOM elements.
 */
export class ReactComponentTracker {
  private cdpDebugger: Electron.Debugger;
  private logger: Logger;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(cdpDebugger: Electron.Debugger, logger: Logger) {
    this.cdpDebugger = cdpDebugger;
    this.logger = logger;
  }

  /**
   * Injects React analysis functions into the main world context.
   * This avoids sending large function declarations on every call.
   */
  private async ensureInitialized(contextId: number): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      try {
        // Inject the React analysis functions into main world context
        // Use a non-enumerable, non-configurable property to make it less detectable
        const result = await this.sendCommand('Runtime.evaluate', {
          expression: `
            (function() {
              // Check if React is available
              const hasReact = typeof window !== 'undefined' && (
                window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
                document.querySelector('[data-reactroot]') !== null ||
                document.querySelector('[data-reactroot]') !== null
              );
              
              // Use a Symbol-based key stored in a WeakMap to make it undetectable
              const analyzerKey = Symbol.for('__sw_react_analyzer__');
              if (window[analyzerKey]) {
                return { initialized: true, hasReact }; // Already initialized
              }

              const analyzer = {
                findFiber: function(node) {
                  if (!node) return null;
                  const props = Object.getOwnPropertyNames(node);
                  for (const key of props) {
                    if (key.startsWith('__reactFiber$')) return node[key] || null;
                    if (key.startsWith('__reactInternalInstance$')) return node[key] || null;
                  }
                  const root = node._reactRootContainer;
                  if (root?._internalRoot?.current) return root._internalRoot.current;
                  return null;
                },
                serializeFiberTree: function(fiber) {
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
                  let currentFiber = fiber;
                  let count = 0;
                  
                  while (currentFiber && count < 30) {
                    if (visited.has(currentFiber)) break;
                    visited.add(currentFiber);
                    
                    try {
                      const typeInfo = extractTypeInfo(currentFiber.type);
                      const elementTypeInfo = extractTypeInfo(currentFiber.elementType);
                      const debugOwner = extractDebugOwner(currentFiber);
                      
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
                    
                    currentFiber = currentFiber.return || null;
                    count++;
                  }
                  
                  return fibers;
                }
              };
              
              // Store in a non-enumerable, non-configurable property
              // This makes it harder for the page to detect or interfere with it
              Object.defineProperty(window, analyzerKey, {
                value: analyzer,
                writable: false,
                enumerable: false,
                configurable: false
              });
              return { initialized: true, success: true, hasReact };
            })();
          `,
          contextId,
        });

        const resultValue = result as {
          result?: {
            value?: {
              initialized?: boolean;
              success?: boolean;
              hasReact?: boolean;
            };
          };
        };
        if (
          resultValue.result?.value?.success ||
          resultValue.result?.value?.initialized
        ) {
          this.isInitialized = true;
        } else {
          this.isInitialized = true; // Mark as initialized anyway
        }
      } catch (_error) {
        // Continue without optimization - will fall back to inline functions
        // Don't mark as initialized so we can retry
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Resets initialization state (e.g., after navigation).
   */
  public resetInitialization() {
    this.isInitialized = false;
    this.initializationPromise = null;
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
   * Uses injected functions in main world context for better performance.
   */
  private async findFiberForElement(
    objectId: string,
    contextId: number,
  ): Promise<string | null> {
    // Ensure functions are injected into main world context
    await this.ensureInitialized(contextId);

    // Try using injected function first (more performant)
    try {
      const fiberResult = (await this.sendCommand('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function() {
          try {
            const analyzerKey = Symbol.for('__sw_react_analyzer__');
            const analyzer = window[analyzerKey];
            if (analyzer && typeof analyzer.findFiber === 'function') {
              let fiber = analyzer.findFiber(this);
              if (fiber) return fiber;
              let current = this.parentElement;
              let depth = 0;
              while (current && depth < 5) {
                fiber = analyzer.findFiber(current);
                if (fiber) return fiber;
                current = current.parentElement;
                depth++;
              }
            }
          } catch (e) {
            // Fall through to inline implementation
          }
          return null;
        }`,
        returnByValue: false,
        // Note: Cannot specify executionContextId when using objectId - objectId already implies the context
      })) as { result?: { objectId?: string } };

      if (fiberResult.result?.objectId) {
        return fiberResult.result.objectId;
      }
    } catch (_error) {
      // Fall through to inline implementation
    }

    // Fallback to inline function if injection failed
    // Now find the fiber (must return objectId, not by value)
    const fiberResult = (await this.sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() {
        const findFiber = (node) => {
          if (!node) return null;
          const nodeProps = Object.getOwnPropertyNames(node);
          for (const key of nodeProps) {
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
      returnByValue: false, // Must return objectId for subsequent calls
      // Note: Cannot specify executionContextId when using objectId - objectId already implies the context
    })) as { result?: { objectId?: string } };

    return fiberResult.result?.objectId || null;
  }

  /**
   * Serializes all relevant fiber nodes by walking up the fiber tree.
   * Extracts only serializable properties to avoid circular references.
   * Uses injected functions in main world context for better performance.
   */
  private async serializeFiberTree(
    fiberObjectId: string,
    contextId: number,
  ): Promise<Array<{
    typeName?: string;
    typeDisplayName?: string;
    elementTypeName?: string;
    elementTypeDisplayName?: string;
    debugOwnerName?: string;
    debugOwnerEnv?: string;
  }> | null> {
    // Ensure functions are injected into main world context
    await this.ensureInitialized(contextId);

    // Try using injected function first (more performant)
    try {
      const result = (await this.sendCommand('Runtime.callFunctionOn', {
        objectId: fiberObjectId,
        functionDeclaration: `function() {
          try {
            const analyzerKey = Symbol.for('__sw_react_analyzer__');
            const analyzer = window[analyzerKey];
            if (analyzer && typeof analyzer.serializeFiberTree === 'function') {
              return analyzer.serializeFiberTree(this);
            }
          } catch (e) {
            // Fall through to inline implementation
          }
          return null;
        }`,
        returnByValue: true,
        // Note: Cannot specify executionContextId when using objectId - objectId already implies the context
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

      if (result.result?.value) {
        return result.result.value;
      }
    } catch (_error) {
      // Fall through to inline implementation
    }

    // Fallback to inline function if injection failed
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
      // Note: Cannot specify executionContextId when using objectId - objectId already implies the context
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
   * Uses injected functions in main world context for better performance.
   *
   * @param objectId - The object ID from DOM.resolveNode (main world)
   * @param contextId - The execution context ID (main world context)
   * @returns React component tree or null if not found
   */
  async fetchReactInfo(
    objectId: string,
    contextId: number,
  ): Promise<ReactSelectedElementInfo | null> {
    try {
      // Step 1: Find the React fiber (uses injected function if available)
      const fiberObjectId = await this.findFiberForElement(objectId, contextId);
      if (!fiberObjectId) {
        return null;
      }

      // Step 2: Serialize all relevant fiber nodes (uses injected function if available)
      const serializedFibers = await this.serializeFiberTree(
        fiberObjectId,
        contextId,
      );
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
