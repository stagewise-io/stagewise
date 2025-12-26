import type { WebContents } from 'electron';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@/services/logger';
import type { SelectedElement } from '@shared/selected-elements';
import { ReactComponentTracker } from './react-component-tracker';

interface ElementSelectorEventMap {
  hoverChanged: [elementId: string | null];
}

interface HoverState {
  id: string; // Stringified backendNodeId
  backendId: number; // Raw integer ID
  frameId: string;
}

export class SelectedElementTracker extends EventEmitter<ElementSelectorEventMap> {
  private webContents: WebContents;
  private debugger: Electron.Debugger;
  private logger: Logger;
  private reactComponentTracker: ReactComponentTracker;
  // Logic State
  private isSelectionActive = false;
  private lastMousePos: { x: number; y: number } | null = null;
  private hitTestThrottleTimer: NodeJS.Timeout | null = null;
  private isHitTestPending = false;
  private readonly HIT_TEST_THROTTLE_MS = 16; // ~60fps for smooth detection
  private lastHitTestTime = 0;
  private lastHitTestResult: { backendNodeId: number; frameId: string } | null =
    null;

  // Cache for parsed element information: Map<`${backendNodeId}:${frameId}`, SelectedElement>
  // This avoids re-parsing the same element when the mouse stays over it
  private parsedElementCache: Map<string, SelectedElement> = new Map();
  private readonly MAX_PARSED_ELEMENT_CACHE_SIZE = 100;

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
    {
      url: string;
      title: string | null;
      isMainFrame: boolean;
      parentFrameId?: string;
    }
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

    this.logger.debug('[SelectedElementTracker] Initialized');

    // Clear hover state and reset initialization on navigation/reload to prevent stale frameId references
    this.webContents.on('did-start-loading', () => {
      this.clearHover();
      // Reset initialization state since contexts will be destroyed on navigation
      this.isInitialized = false;
    });

    // When page finishes loading, ensure we're connected if selection mode is active
    // This handles the case where setContextSelection was called during page load
    this.webContents.on('did-stop-loading', () => {
      if (this.isSelectionActive && !this.isInitialized) {
        this.logger.debug(
          '[SelectedElementTracker] Page finished loading, retrying ensureConnected',
        );
        this.ensureConnected().catch((err) => {
          this.logger.error(
            `[SelectedElementTracker] Failed to connect after page load: ${err}`,
          );
        });
      }
    });

    // Always attach debugger on construction for better performance
    // The performance hit is minimal and avoids attach/detach conflicts
    this.attachDebugger();
  }

  // =========================================================================
  // Connection Lifecycle Management (Requirement #1)
  // =========================================================================

  /**
   * Attaches the debugger if not already attached.
   * This is called on construction to always keep the debugger attached.
   */
  private attachDebugger() {
    // Check if webContents is destroyed or not ready
    if (this.webContents.isDestroyed()) {
      this.logger.debug(
        '[SelectedElementTracker] Cannot attach: webContents is destroyed',
      );
      return;
    }

    if (!this.debugger.isAttached()) {
      try {
        this.debugger.attach('1.3');
        this.logger.debug('[SelectedElementTracker] Debugger attached');
      } catch (err) {
        this.logger.error(
          `[SelectedElementTracker] Failed to attach debugger: ${err}`,
        );
        return;
      }
    }

    // Set up event listeners if not already set up
    if (!this.isInitialized) {
      this.debugger.on('detach', () => this.handleExternalDetach());
      this.debugger.on('message', (_event, method, params) =>
        this.handleCdpMessage(method, params),
      );
    }
  }

  /**
   * Ensures the debugger is attached and domains are enabled.
   * Call this before performing any CDP operations.
   */
  private async ensureConnected() {
    if (this.isInitialized) return;

    // Ensure debugger is attached
    this.attachDebugger();

    // Check if webContents is destroyed or not ready
    if (this.webContents.isDestroyed()) {
      this.logger.debug(
        '[SelectedElementTracker] Cannot connect: webContents is destroyed',
      );
      return;
    }

    // Check if webContents is loading - we need it to be ready for CDP commands
    // If it's still loading, we can't reliably enable domains
    if (this.webContents.isLoading()) {
      this.logger.debug(
        '[SelectedElementTracker] Cannot connect: webContents is still loading',
      );
      return;
    }

    if (!this.debugger.isAttached()) {
      this.logger.debug(
        '[SelectedElementTracker] Debugger not attached, cannot initialize',
      );
      return;
    }

    try {
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
          `[SelectedElementTracker] Failed to get initial frame tree: ${err}`,
        );
      }

      this.isInitialized = true;
    } catch (err) {
      this.logger.error(
        `[SelectedElementTracker] Failed to initialize debugger domains: ${err}`,
      );
      // Reset initialization state on failure
      this.isInitialized = false;
    }
  }

  private handleExternalDetach() {
    // Reset internal state if connection is lost
    this.isInitialized = false;
    this.isSelectionActive = false;
    this.contextCache.clear();
    this.frameCache.clear();
    this.objectIdCache.clear();
    this.parsedElementCache.clear();
    this.mainFrameId = null;
    this.cancelHitTestThrottle();
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
        `[SelectedElementTracker] Failed to fetch frame title for ${frameId}: ${error}`,
      );
    }
    return null;
  }

  private async sendCommand(
    method: string,
    params: any = {},
    retries = 2,
  ): Promise<any> {
    if (!this.debugger.isAttached()) {
      return Promise.reject(new Error('Debugger detached'));
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.debugger.sendCommand(method, params);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errorMessage = lastError.message;

        // Retry on "target closed" errors
        if (
          errorMessage.includes('target closed') &&
          attempt < retries &&
          !this.webContents.isDestroyed()
        ) {
          this.logger.debug(
            `[SelectedElementTracker] Target closed error, retrying (${attempt + 1}/${retries}): ${errorMessage}`,
          );
          // Wait a bit before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1)),
          );
          continue;
        }

        // Don't retry for other errors
        throw lastError;
      }
    }

    throw lastError || new Error('Failed to send command after retries');
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
    try {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // If context is invalid, clear it from cache and rethrow
      if (errorMessage.includes('Cannot find context')) {
        // Clear all cached object IDs for this context
        for (const [key] of this.objectIdCache.entries()) {
          const [, cachedContextIdStr] = key.split(':');
          if (Number.parseInt(cachedContextIdStr, 10) === contextId) {
            this.objectIdCache.delete(key);
          }
        }
        // Clear the context from contextCache if it's invalid
        for (const [frameId, contexts] of this.contextCache.entries()) {
          if (
            contexts.preloadContextId === contextId ||
            contexts.mainWorldContextId === contextId
          ) {
            this.contextCache.delete(frameId);
            break;
          }
        }
      }
      throw err;
    }
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
            // Reset ReactComponentTracker initialization when main world context is destroyed
            this.reactComponentTracker.resetInitialization();
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
          parentFrameId,
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
      // Hit testing is now event-driven, no interval needed
    } else {
      this.cancelHitTestThrottle();
      this.lastMousePos = null;
      this.lastHitTestResult = null;
      // Note: We keep parsedElementCache even when selection is inactive
      // to speed up re-activation if the same elements are hovered
      await this.clearHover();
      // Note: We no longer detach the debugger - it stays attached for better performance
    }
  }

  public async updateMousePosition(x: number, y: number) {
    if (!this.isSelectionActive) return;
    this.lastMousePos = { x, y };
    // Trigger hit test with debouncing to avoid excessive calls during rapid mouse movement
    this.scheduleHitTest();
  }

  public async clearMousePosition() {
    // Clear the hover highlight and stop hit testing
    await this.clearHover();
  }

  public currentlyHoveredElementId(): string | null {
    return this.currentHover?.id ?? null;
  }

  public async collectHoveredElementInfo(): Promise<SelectedElement | null> {
    if (!this.currentHover) return null;
    await this.ensureConnected();

    // Double-check currentHover is still valid after ensureConnected
    // (it might have been cleared during navigation)
    if (!this.currentHover) return null;

    const cacheKey = `${this.currentHover.backendId}:${this.currentHover.frameId}`;

    // Check if we have cached parsed data for this element
    const cachedElement = this.parsedElementCache.get(cacheKey);
    if (cachedElement) {
      // Return cached element, but update dynamic fields (frame info might have changed)
      const frameInfo = await this.getFrameInfo(
        this.currentHover.frameId,
        true,
      );
      return {
        ...cachedElement,
        frameId: this.currentHover.frameId,
        isMainFrame: frameInfo.isMainFrame,
        frameLocation: frameInfo.url,
        frameTitle: frameInfo.title,
        backendNodeId: this.currentHover.backendId,
      };
    }

    // No cache, extract info from scratch
    const selectedElement = await this.extractInfo(this.currentHover);

    if (!selectedElement) return null;

    // Double-check again after extractInfo (it might have been cleared)
    if (!this.currentHover) return null;

    // Get frame information, trying to fetch title if not cached
    const frameInfo = await this.getFrameInfo(this.currentHover.frameId, true);

    // Add frame and tab information to the SelectedElement
    const enrichedElement: SelectedElement = {
      ...selectedElement,
      frameId: this.currentHover.frameId,
      isMainFrame: frameInfo.isMainFrame,
      frameLocation: frameInfo.url,
      frameTitle: frameInfo.title,
      backendNodeId: this.currentHover.backendId,
      // tabId will be filled by TabController
      stagewiseId: selectedElement.id || randomUUID(), // fallback if id missing
      nodeType: selectedElement.tagName, // Ensure nodeType is set for compatibility
      codeMetadata: selectedElement.codeMetadata || [], // Initialize empty code metadata if not present
    };

    // Cache the parsed element (without tabId, as that's added by TabController)
    this.cacheParsedElement(cacheKey, enrichedElement);

    return enrichedElement;
  }

  /**
   * Caches a parsed element, implementing LRU eviction when cache reaches max size.
   */
  private cacheParsedElement(cacheKey: string, element: SelectedElement) {
    // Implement LRU eviction
    if (this.parsedElementCache.size >= this.MAX_PARSED_ELEMENT_CACHE_SIZE) {
      // Delete the oldest entry (first in Map iteration order)
      const firstKey = this.parsedElementCache.keys().next().value;
      if (firstKey) {
        this.parsedElementCache.delete(firstKey);
      }
    }

    // Store element without tabId (it's added by TabController and may vary)
    const { tabId, ...elementWithoutTabId } = element;
    this.parsedElementCache.set(
      cacheKey,
      elementWithoutTabId as SelectedElement,
    );
  }

  // Re-adding a tracker for *currently highlighted* items to enable diffing
  private currentlyHighlighted: Set<string> = new Set();

  public async updateHighlights(
    elements: SelectedElement[],
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
    // Note: We no longer detach the debugger - it stays attached for better performance
  }

  public async getElementInformation(): Promise<SelectedElement | null> {
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
          `[SelectedElementTracker] No contexts found for frameId: ${frameId}`,
        );
        return false;
      }
      // Prefer main world context, fallback to preload context
      const contextId = contexts.mainWorldContextId;
      if (!contextId) {
        this.logger.error(
          `[SelectedElementTracker] No main world context found for frameId: ${frameId}`,
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
        `[SelectedElementTracker] Failed to scroll to element: ${error}`,
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
        `[SelectedElementTracker] Failed to check frame validity: ${error}`,
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
          `[SelectedElementTracker] No contexts found for frameId: ${frameId}`,
        );
        return false;
      }
      const contextId = contexts.mainWorldContextId;
      if (!contextId) {
        this.logger.error(
          `[SelectedElementTracker] No main world context found for frameId: ${frameId}`,
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

  /**
   * Get the cumulative offset of an iframe in main frame coordinates.
   * This is used to transform element coordinates from iframe-local to main-frame-global.
   *
   * @param frameId - The frame ID of the iframe
   * @returns The offset {top, left} to add to element coordinates, or null if main frame or error
   */
  public async getIframeOffsetInMainFrame(
    frameId: string,
  ): Promise<{ top: number; left: number } | null> {
    // If this is the main frame, no offset needed
    const frameInfo = this.frameCache.get(frameId);
    if (!frameInfo || frameInfo.isMainFrame) {
      return null;
    }

    try {
      let cumulativeTop = 0;
      let cumulativeLeft = 0;
      let currentFrameId = frameId;

      // Walk up the frame hierarchy until we reach the main frame
      while (currentFrameId) {
        const currentFrameInfo = this.frameCache.get(currentFrameId);
        if (!currentFrameInfo || currentFrameInfo.isMainFrame) {
          break;
        }

        // Get the iframe element that owns this frame using CDP
        const frameOwnerResult = (await this.sendCommand('DOM.getFrameOwner', {
          frameId: currentFrameId,
        })) as { backendNodeId: number; nodeId?: number };

        if (!frameOwnerResult.backendNodeId) {
          this.logger.debug(
            `[SelectedElementTracker] Could not get frame owner for ${currentFrameId}`,
          );
          return null;
        }

        // Get the bounding box of the iframe element
        // First we need to get the box model which gives us the content quad
        const boxModel = (await this.sendCommand('DOM.getBoxModel', {
          backendNodeId: frameOwnerResult.backendNodeId,
        })) as {
          model?: {
            content: number[];
            border: number[];
          };
        };

        if (boxModel.model?.border) {
          // border array format: [x1, y1, x2, y2, x3, y3, x4, y4] (quad corners)
          // The first point (x1, y1) is the top-left corner
          const borderQuad = boxModel.model.border;
          cumulativeTop += borderQuad[1]; // y1
          cumulativeLeft += borderQuad[0]; // x1
        } else {
          this.logger.debug(
            `[SelectedElementTracker] Could not get box model for iframe in frame ${currentFrameId}`,
          );
          return null;
        }

        // Move to the parent frame
        currentFrameId = currentFrameInfo.parentFrameId || '';
      }

      return { top: cumulativeTop, left: cumulativeLeft };
    } catch (err) {
      this.logger.debug(
        `[SelectedElementTracker] Error getting iframe offset: ${err}`,
      );
      return null;
    }
  }

  // =========================================================================
  // Core Logic
  // =========================================================================

  private cancelHitTestThrottle() {
    if (this.hitTestThrottleTimer) {
      clearTimeout(this.hitTestThrottleTimer);
      this.hitTestThrottleTimer = null;
    }
    this.isHitTestPending = false;
  }

  private scheduleHitTest() {
    const now = Date.now();
    const timeSinceLastTest = now - this.lastHitTestTime;

    // If a hit test is already running, we'll process again after it completes
    if (this.isHitTestPending) {
      return;
    }

    // Fire immediately if enough time has passed, or if this is the first call
    if (
      timeSinceLastTest >= this.HIT_TEST_THROTTLE_MS ||
      this.lastHitTestTime === 0
    ) {
      this.lastHitTestTime = now;
      this.isHitTestPending = true;
      this.processHitTest()
        .catch((err) => {
          this.logger.error(
            `[SelectedElementTracker] Error in hit test: ${err}`,
          );
        })
        .finally(() => {
          this.isHitTestPending = false;
          // If mouse moved during execution, schedule another test
          if (this.lastMousePos && this.isSelectionActive) {
            this.scheduleHitTest();
          }
        });
    } else {
      // Throttle: schedule for later, but only if not already scheduled
      if (!this.hitTestThrottleTimer) {
        const delay = this.HIT_TEST_THROTTLE_MS - timeSinceLastTest;
        this.hitTestThrottleTimer = setTimeout(() => {
          this.hitTestThrottleTimer = null;
          if (
            this.lastMousePos &&
            this.isSelectionActive &&
            !this.isHitTestPending
          ) {
            this.scheduleHitTest();
          }
        }, delay);
      }
    }
  }

  private async processHitTest() {
    if (!this.lastMousePos || !this.isSelectionActive || !this.isInitialized) {
      return;
    }

    // Capture mouse position at start to avoid race conditions
    const mousePos = this.lastMousePos;
    if (!mousePos) {
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
          x: mousePos.x + scrollX,
          y: mousePos.y + scrollY,
          ignorePointerEventsNone: false,
        },
      );

      if (!backendNodeId) {
        // Clear hover if no node found
        if (this.currentHover) {
          await this.clearHover();
        }
        this.lastHitTestResult = null;
        return;
      }

      // FrameID might be missing if it's the Main Frame.
      // We need a reliable way to map Main Frame.
      // Prefer mainFrameId if available, otherwise use frameId or first cached frame
      const actualFrameId =
        frameId ||
        this.mainFrameId ||
        this.contextCache.keys().next().value ||
        '';

      const elementId = backendNodeId.toString();
      const _cacheKey = `${backendNodeId}:${actualFrameId}`;

      // Check if this is the same element as before
      const isSameElement =
        this.lastHitTestResult?.backendNodeId === backendNodeId &&
        this.lastHitTestResult?.frameId === actualFrameId;

      // Always update lastHitTestResult to track current element
      this.lastHitTestResult = {
        backendNodeId,
        frameId: actualFrameId,
      };

      // If it's the same element and we already have it hovered, no need to update
      if (isSameElement && this.currentHover?.id === elementId) {
        return;
      }

      // Update hover state
      if (this.currentHover) {
        await this.triggerPreloadHighlight(this.currentHover, 'hover', false);
      }

      this.currentHover = {
        id: elementId,
        backendId: backendNodeId,
        frameId: actualFrameId,
      };

      await this.triggerPreloadHighlight(this.currentHover, 'hover', true);

      // If we have cached parsed data for this element, we can emit immediately
      // Otherwise, the parsing will happen when collectHoveredElementInfo is called
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
        this.lastHitTestResult = null;
        // Don't log this as an error - it's expected when mouse is outside bounds
      } else {
        this.logger.error(
          `[SelectedElementTracker] processHitTest error: ${e}`,
        );
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
      this.logger.debug(
        `[SelectedElementTracker] No contexts found for frameId: ${state.frameId}, frame may have been destroyed`,
      );
      return;
    }

    // Use preload context for highlighting (needs access to window.__CTX_SELECTION_UPDATE__)
    const contextId = contexts?.preloadContextId;
    if (!contextId) {
      this.logger.debug(
        `[SelectedElementTracker] No preload context found for frameId: ${state.frameId}`,
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // If context is destroyed, clear the hover state gracefully
      if (errorMessage.includes('Cannot find context')) {
        this.logger.debug(
          `[SelectedElementTracker] Context destroyed during highlight for frameId: ${state.frameId}`,
        );
        // Clear hover state if context is invalid
        if (this.currentHover?.frameId === state.frameId && type === 'hover') {
          this.currentHover = null;
        }
      }
      // Silently ignore other errors (element may have been removed from DOM)
    }
  }

  private async extractInfo(
    state: HoverState,
  ): Promise<SelectedElement | null> {
    try {
      const contexts = this.contextCache.get(state.frameId);
      if (!contexts) {
        this.logger.debug(
          `[SelectedElementTracker] No contexts found for frameId: ${state.frameId}, frame may have been destroyed`,
        );
        return null;
      }

      const preloadContextId = contexts.preloadContextId;
      const mainWorldContextId = contexts.mainWorldContextId;

      if (!preloadContextId) {
        this.logger.debug(
          `[SelectedElementTracker] No preload context found for frameId: ${state.frameId}`,
        );
        return null;
      }

      if (!mainWorldContextId) {
        this.logger.debug(
          `[SelectedElementTracker] No main world context found for frameId: ${state.frameId}`,
        );
        return null;
      }

      // Step 1: Serialize element using __CTX_EXTRACT_INFO__ in preload context
      // Resolve node in preload context to access the preload script's global function
      let preloadObjectId: string;
      try {
        const result = await this.resolveNodeWithCache(
          state.backendId,
          preloadContextId,
        );
        preloadObjectId = result.objectId;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes('Cannot find context')) {
          this.logger.debug(
            `[SelectedElementTracker] Context destroyed during extraction for frameId: ${state.frameId}`,
          );
          // Clear hover state if context is invalid
          if (this.currentHover?.frameId === state.frameId) {
            this.clearHover();
          }
        }
        throw err;
      }

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
          `[SelectedElementTracker] No result returned from __CTX_EXTRACT_INFO__`,
        );
        return null;
      }

      const selectedElement = extractResult.result.value as SelectedElement;

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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Cannot find context')) {
          this.logger.debug(
            `[SelectedElementTracker] Main world context destroyed during extraction for frameId: ${state.frameId}`,
          );
          // Clear hover state if context is invalid
          if (this.currentHover?.frameId === state.frameId) {
            this.clearHover();
          }
        } else {
          this.logger.debug(
            `[SelectedElementTracker] Failed to resolve node in main world context: ${error}`,
          );
        }
        // Return what we have from step 1 even if step 2 fails
        return selectedElement;
      }

      if (!mainWorldObjectId) {
        // Return what we have from step 1 even if step 2 fails
        return selectedElement;
      }

      // Step 2: Fetch React information using ReactComponentTracker
      // This is necessary because React fiber trees are in the main world context,
      // which the preload script (isolated world) cannot access directly
      // The preload script's getReactInfo can only access React internals via DOM properties,
      // but ReactComponentTracker uses CDP to access the full fiber tree from main world
      // It uses injected functions in the main world context for better performance
      try {
        const reactData = await this.reactComponentTracker.fetchReactInfo(
          mainWorldObjectId,
          mainWorldContextId,
        );

        // Store React data in frameworkInfo
        // This will override any React info from preload script if it exists
        if (reactData !== null) {
          selectedElement.frameworkInfo = {
            ...selectedElement.frameworkInfo,
            react: reactData,
          };
        }
      } catch (error) {
        // Log but don't fail - we still have other element info
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Cannot find context')) {
          // Context destroyed - expected during navigation
        } else {
          this.logger.debug(
            `[SelectedElementTracker] Failed to fetch React info: ${error}`,
          );
        }
        // Continue with element info even if React info fails
      }

      // Step 3: Fetch own property names from main world context (not full serialization)
      // This gives us a list of property names without the expensive serialization overhead
      // The actual property analysis can be done later if needed, in the main world context
      try {
        const ownPropertyNamesResult = (await this.sendCommand(
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

              const ownProps = Object.getOwnPropertyNames(this);
              // Return only property names, not their values, to avoid serialization overhead
              return ownProps.filter(prop => !excludedProperties.has(prop));
            }`,
            returnByValue: true,
          },
        )) as {
          result?: {
            value?: string[];
          };
        };

        if (ownPropertyNamesResult.result?.value) {
          // Store property names in a special field for reference
          // The actual property values are already captured from preload context
          // This avoids the expensive "Object couldn't be returned by value" errors
          selectedElement.ownProperties = {
            ...selectedElement.ownProperties,
            // Add a marker to indicate these are property names from main world
            _mainWorldPropertyNames: ownPropertyNamesResult.result.value,
          };
        }
      } catch (error) {
        // Log error but don't fail - we still have preload context properties
        this.logger.debug(
          `[SelectedElementTracker] Failed to fetch own property names from main world: ${error}`,
        );
      }

      return selectedElement;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Handle context destruction gracefully
      if (errorMessage.includes('Cannot find context')) {
        this.logger.debug(
          `[SelectedElementTracker] Context destroyed during extraction: ${errorMessage}`,
        );
        // Clear hover state if context is invalid
        if (this.currentHover?.frameId === state.frameId) {
          await this.clearHover();
        }
      } else {
        this.logger.error(
          `[SelectedElementTracker] Failed to extract info: ${error}`,
        );
      }
      return null;
    }
  }
}
