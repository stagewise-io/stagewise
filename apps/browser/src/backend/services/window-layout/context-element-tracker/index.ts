import type { WebContents } from 'electron';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@/services/logger';
import type { ContextElement } from '@shared/context-elements';
import { ReactComponentTracker } from './react-component-tracker';

interface ElementSelectorEventMap {
  hoverChanged: [elementId: string | null];
}

interface HoverState {
  id: string; // Stringified backendNodeId
  backendId: number; // Raw integer ID
  frameId: string;
}

export class ContextElementTracker extends EventEmitter<ElementSelectorEventMap> {
  private webContents: WebContents;
  private debugger: Electron.Debugger;
  private logger: Logger;
  private reactComponentTracker: ReactComponentTracker;
  // Logic State
  private isSelectionActive = false;
  private lastMousePos: { x: number; y: number } | null = null;
  private throttleTimer: NodeJS.Timeout | null = null;
  private readonly HIT_TEST_INTERVAL_MS = 100;

  // Data State
  private currentHover: HoverState | null = null;

  // Cache for Execution Context IDs: Map<FrameId, { preloadContextId: number, mainWorldContextId: number }>
  private contextCache: Map<
    string,
    { preloadContextId: number; mainWorldContextId: number }
  > = new Map();

  // Cache for Frame Information: Map<FrameId, FrameInfo>
  private frameCache: Map<
    string,
    { url: string; title: string | null; isMainFrame: boolean }
  > = new Map();
  private mainFrameId: string | null = null;

  // Cache for Object IDs: Map<`${backendNodeId}:${contextId}`, objectId>
  // LRU cache with max 1000 entries
  private objectIdCache: Map<string, string> = new Map();
  private readonly MAX_OBJECT_ID_CACHE_SIZE = 1000;

  // Initialization State
  private isInitialized = false;

  constructor(webContents: WebContents, logger: Logger) {
    super();
    this.webContents = webContents;
    this.debugger = this.webContents.debugger;
    this.logger = logger;
    this.reactComponentTracker = new ReactComponentTracker(
      this.debugger,
      this.logger,
    );

    this.logger.debug('[ContextElementTracker] Initialized');

    // Clear hover state on navigation/reload to prevent stale frameId references
    this.webContents.on('did-start-loading', () => {
      this.clearHover();
    });

    // Note: We do NOT attach here. We wait for usage.
  }

  // =========================================================================
  // Connection Lifecycle Management (Requirement #1)
  // =========================================================================

  /**
   * Ensures the debugger is attached and domains are enabled.
   * Call this before performing any CDP operations.
   */
  private async ensureConnected() {
    if (this.isInitialized) return;

    // Check if webContents is destroyed or not ready
    if (this.webContents.isDestroyed()) {
      this.logger.debug(
        '[ContextElementTracker] Cannot connect: webContents is destroyed',
      );
      return;
    }

    // Check if webContents is loading - we need it to be ready for CDP commands
    // If it's still loading, we can't reliably attach the debugger
    if (this.webContents.isLoading()) {
      this.logger.debug(
        '[ContextElementTracker] Cannot connect: webContents is still loading',
      );
      return;
    }

    if (!this.debugger.isAttached()) {
      try {
        this.debugger.attach('1.3');
        this.logger.debug('[ContextElementTracker] Debugger attached');
      } catch (err) {
        this.logger.error(
          `[ContextElementTracker] Failed to attach debugger: ${err}`,
        );
        // Reset initialization state on failure
        this.isInitialized = false;
        return;
      }
    }

    try {
      // Listen for detached event to cleanup state if user/devtools closes it
      this.debugger.on('detach', () => this.handleExternalDetach());
      this.debugger.on('message', (_event, method, params) =>
        this.handleCdpMessage(method, params),
      );

      await this.sendCommand('DOM.enable');
      await this.sendCommand('Page.enable');
      await this.sendCommand('Runtime.enable'); // Needed to find isolated worlds
      // Note: Runtime.enable will trigger Runtime.executionContextCreated events
      // for all existing contexts, so we don't need to query them separately

      // Initialize frame information by getting the frame tree
      try {
        const frameTree = await this.sendCommand('Page.getFrameTree');
        this.initializeFrameTree(frameTree.frameTree);
      } catch (err) {
        this.logger.debug(
          `[ContextElementTracker] Failed to get initial frame tree: ${err}`,
        );
      }

      this.isInitialized = true;
    } catch (err) {
      this.logger.error(
        `[ContextElementTracker] Failed to initialize debugger domains: ${err}`,
      );
      // Reset initialization state on failure
      this.isInitialized = false;
      // Detach debugger if initialization failed
      try {
        if (this.debugger.isAttached()) {
          this.debugger.detach();
        }
      } catch {
        // Ignore detach errors
      }
    }
  }

  /**
   * Checks if we still need the debugger. If not, detach.
   */
  private async checkDisconnect() {
    // We stay connected if:
    // 1. Context Selection (Hovering) is active
    const isNeeded = this.isSelectionActive;

    if (!isNeeded && this.debugger.isAttached()) {
      try {
        // Clear any cached contexts before detaching
        this.contextCache.clear();
        this.debugger.detach();
        this.logger.debug('[ContextElementTracker] Debugger detached');
      } catch {
        /* ignore */
      }
    }
  }

  private handleExternalDetach() {
    // Reset internal state if connection is lost
    this.isInitialized = false;
    this.isSelectionActive = false;
    this.contextCache.clear();
    this.frameCache.clear();
    this.objectIdCache.clear();
    this.mainFrameId = null;
    this.stopThrottle();
  }

  /**
   * Recursively initialize frame tree information.
   */
  private initializeFrameTree(frameTree: {
    frame: { id: string; url: string; name?: string; parentId?: string };
    childFrames?: Array<{
      frame: {
        id: string;
        url: string;
        name?: string;
        parentId?: string;
      };
      childFrames?: any[];
    }>;
  }) {
    const frame = frameTree.frame;
    const isMainFrame = frame.parentId === undefined;

    if (isMainFrame) {
      this.mainFrameId = frame.id;
    }

    // Note: frame.name is the frame's name attribute, not the document title
    // The document title will come from Page.frameTitleUpdated events
    // Preserve existing title if frame was already cached
    const existing = this.frameCache.get(frame.id);
    this.frameCache.set(frame.id, {
      url: frame.url || '',
      title: existing?.title || null,
      isMainFrame,
    });

    // Recursively process child frames
    if (frameTree.childFrames) {
      for (const childFrame of frameTree.childFrames) {
        this.initializeFrameTree(childFrame);
      }
    }
  }

  /**
   * Get frame information for a given frameId.
   * Optionally tries to fetch the title directly from the frame's document if not cached.
   */
  private async getFrameInfo(
    frameId: string,
    tryFetchTitle = false,
  ): Promise<{
    url: string;
    title: string | null;
    isMainFrame: boolean;
  }> {
    const cached = this.frameCache.get(frameId);
    if (cached) {
      // If we have a cached title, return it
      if (cached.title) {
        return cached;
      }
      // If title is missing and we should try to fetch it, attempt to get it from the document
      if (tryFetchTitle) {
        const title = await this.fetchFrameTitle(frameId);
        if (title) {
          // Update cache with the fetched title
          this.frameCache.set(frameId, {
            ...cached,
            title,
          });
          return {
            ...cached,
            title,
          };
        }
      }
      return cached;
    }

    // Fallback: assume it's the main frame if we don't have info
    const isMainFrame =
      frameId === this.mainFrameId || this.mainFrameId === null;
    return {
      url: '',
      title: null,
      isMainFrame,
    };
  }

  /**
   * Try to fetch the frame's document title directly using CDP.
   */
  private async fetchFrameTitle(frameId: string): Promise<string | null> {
    try {
      const contexts = this.contextCache.get(frameId);
      // Prefer main world context, fallback to preload context
      const contextId =
        contexts?.mainWorldContextId || contexts?.preloadContextId;
      if (!contextId) {
        return null;
      }

      // Evaluate document.title in the frame's context
      const result = await this.sendCommand('Runtime.evaluate', {
        expression: 'document.title',
        contextId,
        returnByValue: true,
      });

      if (result.result?.value && typeof result.result.value === 'string') {
        return result.result.value || null;
      }
    } catch (error) {
      // Silently fail - title might not be accessible (cross-origin, etc.)
      this.logger.debug(
        `[ContextElementTracker] Failed to fetch frame title for ${frameId}: ${error}`,
      );
    }
    return null;
  }

  private sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this.debugger.isAttached())
      return Promise.reject(new Error('Debugger detached'));
    return this.debugger.sendCommand(method, params);
  }

  /**
   * Resolves a DOM node to an object ID, using cache when available.
   * Cache key is `${backendNodeId}:${contextId}`.
   * Implements LRU eviction when cache reaches MAX_OBJECT_ID_CACHE_SIZE.
   */
  private async resolveNodeWithCache(
    backendNodeId: number,
    contextId: number,
  ): Promise<{ objectId: string }> {
    const cacheKey = `${backendNodeId}:${contextId}`;
    const cachedObjectId = this.objectIdCache.get(cacheKey);

    if (cachedObjectId) {
      return { objectId: cachedObjectId };
    }

    // Cache miss - fetch from CDP
    const { object } = await this.sendCommand('DOM.resolveNode', {
      backendNodeId,
      executionContextId: contextId,
    });

    if (!object.objectId) {
      throw new Error(
        `No objectId returned from DOM.resolveNode for backendNodeId: ${backendNodeId}, contextId: ${contextId}`,
      );
    }

    // Add to cache, implementing LRU eviction
    if (this.objectIdCache.size >= this.MAX_OBJECT_ID_CACHE_SIZE) {
      // Delete the oldest entry (first in Map iteration order)
      const firstKey = this.objectIdCache.keys().next().value;
      if (firstKey) {
        this.objectIdCache.delete(firstKey);
      }
    }

    this.objectIdCache.set(cacheKey, object.objectId);

    return { objectId: object.objectId };
  }

  /**
   * Listens for execution context creation to map Frames to their Isolated Worlds and Main Worlds.
   * Also tracks frame information (URL, title, isMainFrame).
   */
  private handleCdpMessage(method: string, params: any) {
    if (method === 'Runtime.executionContextCreated') {
      const ctx = params.context;
      const frameId = ctx.auxData?.frameId;

      if (frameId) {
        let { preloadContextId, mainWorldContextId } = this.contextCache.get(
          frameId,
        ) || {
          preloadContextId: 0,
          mainWorldContextId: 0,
        };

        if (ctx.name === 'Electron Isolated Context') {
          // This is the preload script context (isolated world)
          preloadContextId = ctx.id;
        } else if (ctx.auxData?.type === 'default' || ctx.name === '') {
          // This is the main world context
          mainWorldContextId = ctx.id;
        }

        // Only store if we have at least one context ID
        if (preloadContextId || mainWorldContextId) {
          this.contextCache.set(frameId, {
            preloadContextId,
            mainWorldContextId,
          });
        }
      }
    } else if (method === 'Runtime.executionContextDestroyed') {
      // Optional: Cleanup the cache if the context is destroyed
      // This happens on page navigation or reload
      const destroyedContextId = params.executionContextId;

      // Clear all object IDs cached for this context, as they become invalid
      for (const [key] of this.objectIdCache.entries()) {
        const [, contextIdStr] = key.split(':');
        if (Number.parseInt(contextIdStr, 10) === destroyedContextId) {
          this.objectIdCache.delete(key);
        }
      }

      for (const [frameId, contexts] of this.contextCache.entries()) {
        if (
          contexts.preloadContextId === destroyedContextId ||
          contexts.mainWorldContextId === destroyedContextId
        ) {
          // Remove the destroyed context from the entry
          if (contexts.preloadContextId === destroyedContextId) {
            contexts.preloadContextId = 0;
          }
          if (contexts.mainWorldContextId === destroyedContextId) {
            contexts.mainWorldContextId = 0;
          }

          // If both contexts are gone, remove the entry entirely
          if (!contexts.preloadContextId && !contexts.mainWorldContextId) {
            this.contextCache.delete(frameId);
            // Clear hover state if it references this destroyed frame
            if (this.currentHover?.frameId === frameId) {
              this.clearHover();
            }
          }
          break;
        }
      }
    } else if (method === 'Page.frameNavigated') {
      // Track frame information when frames navigate
      const frame = params.frame;
      if (frame?.id) {
        const isMainFrame = frame.parentId === undefined;
        if (isMainFrame) {
          this.mainFrameId = frame.id;
        }
        // Note: frame.name is the frame's name attribute, not the document title
        // The document title comes from Page.frameTitleUpdated events
        const existing = this.frameCache.get(frame.id);
        this.frameCache.set(frame.id, {
          url: frame.url || '',
          title: existing?.title || null, // Preserve existing title if available
          isMainFrame,
        });
      }
    } else if (method === 'Page.frameAttached') {
      // Track when frames are attached (for iframes)
      const frameId = params.frameId;
      const parentFrameId = params.parentFrameId;
      if (frameId && parentFrameId !== undefined) {
        // This is a subframe (iframe)
        this.frameCache.set(frameId, {
          url: '',
          title: null,
          isMainFrame: false,
        });
      }
    } else if (method === 'Page.frameDetached') {
      // Clean up frame information when frames are detached
      const frameId = params.frameId;
      if (frameId) {
        this.frameCache.delete(frameId);
        this.contextCache.delete(frameId);
        if (this.mainFrameId === frameId) {
          this.mainFrameId = null;
        }
        // Clear hover state if it references this detached frame
        if (this.currentHover?.frameId === frameId) {
          this.clearHover();
        }
      }
    } else if (method === 'Page.frameTitleUpdated') {
      // Update frame title when it changes
      const frameId = params.frameId;
      const title = params.title || null;
      if (frameId) {
        const existing = this.frameCache.get(frameId);
        if (existing) {
          // Update existing frame entry
          this.frameCache.set(frameId, {
            ...existing,
            title,
          });
        } else {
          // Create frame entry if it doesn't exist yet (title update can come before frameNavigated)
          const isMainFrame = frameId === this.mainFrameId;
          this.frameCache.set(frameId, {
            url: '',
            title,
            isMainFrame,
          });
        }
      }
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  public async setContextSelection(active: boolean) {
    if (this.isSelectionActive === active) return;
    this.isSelectionActive = active;

    if (active) {
      await this.ensureConnected();
      // Only start the throttle timer if we successfully connected
      if (this.isInitialized && !this.throttleTimer) {
        this.throttleTimer = setInterval(
          () => this.processHitTest(),
          this.HIT_TEST_INTERVAL_MS,
        );
      }
    } else {
      this.stopThrottle();
      this.lastMousePos = null;
      await this.clearHover();
      this.checkDisconnect(); // Detach if no selections remain
    }
  }

  public async updateMousePosition(x: number, y: number) {
    if (!this.isSelectionActive) return;
    this.lastMousePos = { x, y };
    // We rely on the interval to process this
  }

  public async clearMousePosition() {
    // Clear the hover highlight and stop hit testing
    await this.clearHover();
  }

  public currentlyHoveredElementId(): string | null {
    return this.currentHover?.id ?? null;
  }

  public async collectHoveredElementInfo(): Promise<ContextElement | null> {
    if (!this.currentHover) return null;
    await this.ensureConnected();

    // Double-check currentHover is still valid after ensureConnected
    // (it might have been cleared during navigation)
    if (!this.currentHover) return null;

    const contextElement = await this.extractInfo(this.currentHover);

    if (!contextElement) return null;

    // Double-check again after extractInfo (it might have been cleared)
    if (!this.currentHover) return null;

    // Get frame information, trying to fetch title if not cached
    const frameInfo = await this.getFrameInfo(this.currentHover.frameId, true);

    // Add frame and tab information to the ContextElement
    const enrichedElement: ContextElement = {
      ...contextElement,
      frameId: this.currentHover.frameId,
      isMainFrame: frameInfo.isMainFrame,
      frameLocation: frameInfo.url,
      frameTitle: frameInfo.title,
      backendNodeId: this.currentHover.backendId,
      // tabId will be filled by TabController
      stagewiseId: contextElement.id || randomUUID(), // fallback if id missing
      nodeType: contextElement.tagName, // Ensure nodeType is set for compatibility
      codeMetadata: contextElement.codeMetadata || [], // Initialize empty code metadata if not present
    };

    return enrichedElement;
  }

  // Re-adding a tracker for *currently highlighted* items to enable diffing
  private currentlyHighlighted: Set<string> = new Set();

  public async updateHighlights(
    elements: ContextElement[],
    currentTabId: string,
  ) {
    const hasItemsToHighlight = elements.some(
      (el) => el.tabId === currentTabId,
    );
    const hasItemsToUnhighlight = this.currentlyHighlighted.size > 0;

    if (!hasItemsToHighlight && !hasItemsToUnhighlight) return;

    await this.ensureConnected();

    const nextHighlighted = new Set<string>();

    // Highlight new ones
    for (const el of elements) {
      if (el.tabId !== currentTabId) continue;

      const key = `${el.frameId}:${el.backendNodeId}`;
      nextHighlighted.add(key);

      if (!this.currentlyHighlighted.has(key)) {
        const hoverState: HoverState = {
          id: String(el.backendNodeId),
          backendId: el.backendNodeId!,
          frameId: el.frameId!,
        };
        await this.triggerPreloadHighlight(hoverState, 'selected', true);
      }
    }

    // Unhighlight removed ones
    // We need to store enough info to unhighlight (frameId, backendId).
    // The key `${frameId}:${backendNodeId}` helps.
    for (const key of this.currentlyHighlighted) {
      if (!nextHighlighted.has(key)) {
        const [frameId, backendIdStr] = key.split(':');
        const backendId = Number.parseInt(backendIdStr, 10);
        const hoverState: HoverState = {
          id: backendIdStr,
          backendId: backendId,
          frameId: frameId,
        };
        await this.triggerPreloadHighlight(hoverState, 'selected', false);
      }
    }

    this.currentlyHighlighted = nextHighlighted;
    this.checkDisconnect();
  }

  public async getElementInformation(): Promise<ContextElement | null> {
    // This method was used to get info for an ID.
    // Now we expect info to be in the global store.
    // But if we need to fetch it fresh:
    // We need to know frameId and backendNodeId to resolve it.
    // If we don't have it, we can't easily fetch it without searching.
    // Assuming this method might be deprecated or we implement it if we have the info.
    // The original implementation used `selectedElements` map to find the target.
    // If we removed that map, we can't look it up unless we pass frameId/backendId.
    return null;
  }

  public async scrollToElement(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    await this.ensureConnected();
    try {
      const contexts = this.contextCache.get(frameId);
      if (!contexts) {
        this.logger.error(
          `[ContextElementTracker] No contexts found for frameId: ${frameId}`,
        );
        return false;
      }
      // Prefer main world context, fallback to preload context
      const contextId = contexts.mainWorldContextId;
      if (!contextId) {
        this.logger.error(
          `[ContextElementTracker] No main world context found for frameId: ${frameId}`,
        );
        return false;
      }

      const { objectId } = await this.resolveNodeWithCache(
        backendNodeId,
        contextId,
      );

      // Call scrollIntoView on the element using Runtime.callFunctionOn
      await this.sendCommand('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function() {
          if (this.scrollIntoView) {
            this.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }
        }`,
        returnByValue: false,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `[ContextElementTracker] Failed to scroll to element: ${error}`,
      );
      return false;
    }
  }

  public async checkFrameValidity(
    frameId: string,
    expectedFrameLocation: string,
  ): Promise<boolean> {
    await this.ensureConnected();
    try {
      // Refresh frame tree to get current frame information
      const frameTree = await this.sendCommand('Page.getFrameTree');
      this.initializeFrameTree(frameTree.frameTree);

      const frameInfo = await this.getFrameInfo(frameId, false);
      if (!frameInfo || !frameInfo.url) {
        // Frame doesn't exist or has no URL
        return false;
      }

      // Compare the frame's current URL with the expected location
      // We compare origin and pathname, ignoring hash and search params
      try {
        const currentUrl = new URL(frameInfo.url);
        const expectedUrl = new URL(expectedFrameLocation);
        return (
          currentUrl.origin === expectedUrl.origin &&
          currentUrl.pathname === expectedUrl.pathname
        );
      } catch {
        // If URL parsing fails, do a simple string comparison
        return frameInfo.url === expectedFrameLocation;
      }
    } catch (error) {
      this.logger.debug(
        `[ContextElementTracker] Failed to check frame validity: ${error}`,
      );
      return false;
    }
  }

  public async checkElementExists(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    await this.ensureConnected();
    try {
      const contexts = this.contextCache.get(frameId);
      if (!contexts) {
        this.logger.error(
          `[ContextElementTracker] No contexts found for frameId: ${frameId}`,
        );
        return false;
      }
      const contextId = contexts.mainWorldContextId;
      if (!contextId) {
        this.logger.error(
          `[ContextElementTracker] No main world context found for frameId: ${frameId}`,
        );
        return false;
      }

      // Try to resolve the node - if it succeeds, the element exists
      await this.resolveNodeWithCache(backendNodeId, contextId);

      // If we get here, the element exists
      return true;
    } catch {
      // If resolving fails, the element doesn't exist
      return false;
    }
  }

  // =========================================================================
  // Core Logic
  // =========================================================================

  private stopThrottle() {
    if (this.throttleTimer) {
      clearInterval(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  private async processHitTest() {
    if (!this.lastMousePos || !this.isSelectionActive || !this.isInitialized) {
      return;
    }

    try {
      const { cssLayoutViewport } = await this.sendCommand(
        'Page.getLayoutMetrics',
      );
      const scrollX = cssLayoutViewport.pageX;
      const scrollY = cssLayoutViewport.pageY;

      const { backendNodeId, frameId } = await this.sendCommand(
        'DOM.getNodeForLocation',
        {
          x: this.lastMousePos.x + scrollX,
          y: this.lastMousePos.y + scrollY,
          ignorePointerEventsNone: false,
        },
      );

      if (!backendNodeId) return;

      const elementId = backendNodeId.toString();
      // FrameID might be missing if it's the Main Frame.
      // We need a reliable way to map Main Frame.
      // Prefer mainFrameId if available, otherwise use frameId or first cached frame
      const actualFrameId =
        frameId ||
        this.mainFrameId ||
        this.contextCache.keys().next().value ||
        '';

      if (this.currentHover?.id === elementId) return;

      if (this.currentHover) {
        await this.triggerPreloadHighlight(this.currentHover, 'hover', false);
      }

      this.currentHover = {
        id: elementId,
        backendId: backendNodeId,
        frameId: actualFrameId,
      };

      await this.triggerPreloadHighlight(this.currentHover, 'hover', true);

      this.emit('hoverChanged', elementId);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // If no node found at location, clear hover and stop processing this position
      // This is expected when the mouse is outside the web content bounds
      if (errorMessage.includes('No node found')) {
        if (this.currentHover) {
          await this.clearHover();
        } else {
          this.lastMousePos = null; // Clear position to stop retrying
        }
        // Don't log this as an error - it's expected when mouse is outside bounds
      } else {
        this.logger.error(`[ContextElementTracker] processHitTest error: ${e}`);
      }
    }
  }

  public async clearHover() {
    if (this.currentHover && this.debugger.isAttached()) {
      await this.triggerPreloadHighlight(this.currentHover, 'hover', false);
    }
    this.currentHover = null;
    this.lastMousePos = null; // Clear mouse position to stop hit test attempts
    this.emit('hoverChanged', null);
  }

  /**
   * The Critical Bridge:
   * Calls the function defined in the Preload Script (Isolated World).
   */
  private async triggerPreloadHighlight(
    state: HoverState,
    type: 'hover' | 'selected',
    active: boolean,
  ) {
    const contexts = this.contextCache.get(state.frameId);
    if (!contexts) {
      this.logger.error(
        `[ContextElementTracker] No contexts found for frameId: ${state.frameId}`,
      );
      return;
    }

    // Use preload context for highlighting (needs access to window.__CTX_SELECTION_UPDATE__)
    const contextId = contexts?.preloadContextId;
    if (!contextId) {
      this.logger.error(
        `[ContextElementTracker] No preload context found for frameId: ${state.frameId}`,
      );
      return;
    }

    try {
      const { objectId } = await this.resolveNodeWithCache(
        state.backendId,
        contextId,
      );

      await this.sendCommand('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function(type, active) {
                 if (window.__CTX_SELECTION_UPDATE__) {
                    window.__CTX_SELECTION_UPDATE__(this, type, active);
                 }
            }`,
        arguments: [{ value: type }, { value: active }],
      });
    } catch {
      /* ignore */
    }
  }

  private async extractInfo(state: HoverState): Promise<ContextElement | null> {
    try {
      const contexts = this.contextCache.get(state.frameId);
      if (!contexts) {
        this.logger.error(
          `[ContextElementTracker] No contexts found for frameId: ${state.frameId}`,
        );
        return null;
      }

      const preloadContextId = contexts.preloadContextId;
      const mainWorldContextId = contexts.mainWorldContextId;

      if (!preloadContextId) {
        this.logger.error(
          `[ContextElementTracker] No preload context found for frameId: ${state.frameId}`,
        );
        return null;
      }

      if (!mainWorldContextId) {
        this.logger.error(
          `[ContextElementTracker] No main world context found for frameId: ${state.frameId}`,
        );
        return null;
      }

      // Step 1: Serialize element using __CTX_EXTRACT_INFO__ in preload context
      // Resolve node in preload context to access the preload script's global function
      const { objectId: preloadObjectId } = await this.resolveNodeWithCache(
        state.backendId,
        preloadContextId,
      );

      // Call __CTX_EXTRACT_INFO__ which exists in the preload script context
      const extractResult = await this.sendCommand('Runtime.callFunctionOn', {
        objectId: preloadObjectId,
        functionDeclaration: `function(id) {
            if (window.__CTX_EXTRACT_INFO__) {
                return window.__CTX_EXTRACT_INFO__(this, id);
            }
            return null;
        }`,
        arguments: [{ value: state.id }],
        returnByValue: true,
      });

      if (!extractResult.result?.value) {
        this.logger.error(
          `[ContextElementTracker] No result returned from __CTX_EXTRACT_INFO__`,
        );
        return null;
      }

      const contextElement = extractResult.result.value as ContextElement;

      // Step 2: Fetch additional properties from main world context
      // Resolve node in main world context to access React and other framework info
      let mainWorldObjectId: string | null = null;
      try {
        const result = await this.resolveNodeWithCache(
          state.backendId,
          mainWorldContextId,
        );
        mainWorldObjectId = result.objectId;
      } catch (error) {
        this.logger.error(
          `[ContextElementTracker] Failed to resolve node in main world context: ${error}`,
        );
        // Return what we have from step 1 even if step 2 fails
        return contextElement;
      }

      if (!mainWorldObjectId) {
        // Return what we have from step 1 even if step 2 fails
        return contextElement;
      }

      // Fetch React information using ReactComponentTracker
      // This returns raw data that will be parsed later
      const reactData =
        await this.reactComponentTracker.fetchReactInfo(mainWorldObjectId);

      // Store raw React data in frameworkInfo for now
      // The actual parsing logic will be implemented separately
      if (reactData !== null) {
        contextElement.frameworkInfo = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          react: reactData as any,
        };
      }

      // Step 3: Fetch own properties from main world context
      // This gives us access to framework-specific properties and custom properties
      try {
        const ownPropertiesResult = (await this.sendCommand(
          'Runtime.callFunctionOn',
          {
            objectId: mainWorldObjectId,
            functionDeclaration: `function() {
              const excludedProperties = new Set([
                'constructor',
                '__proto__',
                'prototype',
                '__defineGetter__',
                '__defineSetter__',
                '__lookupGetter__',
                '__lookupSetter__',
                'hasOwnProperty',
                'isPrototypeOf',
                'propertyIsEnumerable',
                'toString',
                'valueOf',
                'toLocaleString',
              ]);

              const copyObject = (obj, depth, maxDepth) => {
                if (obj === null || obj === undefined) {
                  return obj;
                }

                if (typeof obj !== 'object') {
                  return typeof obj === 'function' ? undefined : obj;
                }

                if (depth >= maxDepth) {
                  if (Array.isArray(obj)) {
                    return [];
                  }
                  return {};
                }

                if (Array.isArray(obj)) {
                  return obj
                    .map((item) => copyObject(item, depth + 1, maxDepth))
                    .filter((item) => item !== undefined)
                    .slice(0, 50);
                }

                const result = {};
                const ownProps = Object.getOwnPropertyNames(obj);
                
                for (let i = 0; i < Math.min(ownProps.length, 500); i++) {
                  const key = ownProps[i];
                  
                  if (excludedProperties.has(key)) {
                    continue;
                  }

                  try {
                    const value = obj[key];
                    
                    if (typeof value === 'function') {
                      continue;
                    }

                    const copiedValue = copyObject(value, depth + 1, maxDepth);
                    
                    if (copiedValue !== undefined) {
                      result[key] = copiedValue;
                    }
                  } catch {
                    // Skip properties that throw errors when accessed
                    continue;
                  }
                }

                return result;
              };

              const ownProps = Object.getOwnPropertyNames(this);
              const result = {};
              
              for (let i = 0; i < Math.min(ownProps.length, 500); i++) {
                const prop = ownProps[i];
                
                if (excludedProperties.has(prop)) {
                  continue;
                }

                try {
                  const value = this[prop];
                  
                  if (typeof value === 'function') {
                    continue;
                  }

                  result[prop] = copyObject(value, 0, 3);
                } catch {
                  // Skip properties that throw errors when accessed
                  continue;
                }
              }

              return result;
            }`,
            returnByValue: true,
          },
        )) as {
          result?: {
            value?: Record<string, unknown>;
          };
        };

        if (ownPropertiesResult.result?.value) {
          // Merge main world ownProperties into contextElement
          contextElement.ownProperties = {
            ...contextElement.ownProperties,
            ...ownPropertiesResult.result.value,
          };
        }
      } catch (error) {
        // Log error but don't fail - we still have preload context properties
        this.logger.debug(
          `[ContextElementTracker] Failed to fetch own properties from main world: ${error}`,
        );
      }

      return contextElement;
    } catch (error) {
      // Silently fail if extraction fails
      this.logger.error(
        `[ContextElementTracker] Failed to extract info: ${error}`,
      );
      return null;
    }
  }
}
