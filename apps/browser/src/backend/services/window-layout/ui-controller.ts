import { WebContentsView, shell, session, app, net } from 'electron';
import { domCodeToElectronKeyCode } from '../../utils/dom-code-to-electron-key-code';
import path from 'node:path';
import fs from 'node:fs/promises';
import contextMenu from 'electron-context-menu';
import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import { EventEmitter } from 'node:events';
import { KartonService } from '../karton';
import type { SerializableKeyboardEvent } from '@shared/karton-contracts/web-contents-preload';
import type { ColorScheme } from '@shared/karton-contracts/ui';
import type { PageTransition } from '@shared/karton-contracts/pages-api/types';
import type { SelectedElement } from '@shared/selected-elements';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canBrowserHandleUrl } from './protocol-utils';
import {
  default as installExtension,
  REACT_DEVELOPER_TOOLS,
} from 'electron-devtools-installer';
import fsSync from 'node:fs';
import { getBlobPath, blobExists } from '@/utils/attachment-blobs';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { inferMimeType } from '@shared/mime-utils';
import { getAgentAppsDir } from '@/utils/paths';
import { getPluginsPath } from '@/utils/paths';

const UI_SESSION_PARTITION = 'persist:stagewise-ui';

/**
 * Search user message metadata for a matching file attachment.
 * Returns the mediaType if found, undefined otherwise.
 */
function findMediaTypeInUserAttachments(
  history: AgentMessage[],
  attachmentId: string,
): string | undefined {
  for (const msg of history) {
    const att = msg.metadata?.fileAttachments?.find(
      (f) => f.id === attachmentId,
    );
    if (att) return att.mediaType;
  }
  return undefined;
}

/**
 * Search sandbox tool outputs (`_customFileAttachments`) for a matching
 * attachment. Returns the mediaType if found, undefined otherwise.
 */
function findMediaTypeInSandboxOutputs(
  history: AgentMessage[],
  attachmentId: string,
): string | undefined {
  for (const msg of history) {
    if (msg.role === 'user') continue;
    for (const part of msg.parts) {
      if (!('output' in part) || !part.output) continue;
      if (typeof part.output !== 'object') continue;

      const customs = (part.output as Record<string, unknown>)
        ._customFileAttachments;
      if (!Array.isArray(customs)) continue;

      const found = customs.find(
        (c: unknown): c is { id: string; mediaType: string } =>
          typeof c === 'object' &&
          c !== null &&
          'id' in c &&
          (c as { id: unknown }).id === attachmentId,
      );
      if (found) return found.mediaType;
    }
  }
  return undefined;
}

/**
 * Returns the on-disk cache path that electron-devtools-installer uses for an
 * extension, mirroring its internal `getPath()` + chromeStoreID logic.
 */
function getExtensionCachePath(extensionId: string): string {
  return path.resolve(app.getPath('userData'), 'extensions', extensionId);
}

/**
 * Installs React DevTools on the UI session without blocking startup.
 *
 * How electron-devtools-installer works (relevant to the perf decision):
 *   - It stores extensions at `{userData}/extensions/{extensionId}/`.
 *   - On install, it checks `fs.existsSync(extensionFolder)`. If the folder
 *     already exists AND `forceDownload` is false, it skips the network entirely
 *     and just calls `session.loadExtension(folder)`. There is no version check.
 *   - The only network call is on first download (when the folder is absent).
 *
 * Strategy:
 *   - If the cache folder exists: call installExtension normally — it is a fast
 *     filesystem-only operation, safe to await. Also fire a background
 *     `forceDownload: true` call to refresh the extension on disk for the next
 *     launch (this is the update mechanism, since the library has no built-in
 *     version checking).
 *   - If the cache folder is absent (first launch): do NOT await — the network
 *     download would block startup. Fire it in the background; the extension
 *     will be available on the next launch.
 *
 * The Chromium constraint (extension must be registered before the session
 * hosts any WebContentsView) only applies when we actually load the extension.
 * On first launch we skip loading, so the constraint is not violated.
 */
async function installReactDevToolsOnUISession(logger: Logger): Promise<void> {
  if (app.isPackaged) return; // Don't install in production

  const extensionId = REACT_DEVELOPER_TOOLS.id;
  const cacheFolder = getExtensionCachePath(extensionId);
  const isCached = fsSync.existsSync(cacheFolder);

  if (isCached) {
    // Fast path: folder exists, installExtension will skip the network and
    // just call session.loadExtension — safe to await.
    try {
      const uiSession = session.fromPartition(UI_SESSION_PARTITION);
      const ext = await installExtension(REACT_DEVELOPER_TOOLS, {
        loadExtensionOptions: { allowFileAccess: true },
        session: uiSession,
      });
      logger.debug(
        `[UIController] Loaded React DevTools ${ext.version} on UI session`,
      );
    } catch (err) {
      logger.warn('[UIController] Failed to load React DevTools:', err);
    }

    // Background update: force-redownload to refresh the on-disk cache.
    // The updated version will be picked up on the next launch.
    installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true },
      forceDownload: true,
    })
      .then((ext) => {
        logger.debug(
          `[UIController] React DevTools cache refreshed to ${ext.version}; active on next launch`,
        );
      })
      .catch((err) => {
        logger.debug(
          '[UIController] Background React DevTools refresh failed (non-critical):',
          err,
        );
      });
  } else {
    // Slow path: no cache — would require a network download. Do not await;
    // fire in background so startup is not blocked. Extension will load on
    // the next launch once the cache folder exists.
    logger.debug(
      '[UIController] React DevTools not cached; downloading in background for next launch',
    );
    installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true },
      forceDownload: false,
    })
      .then((ext) => {
        logger.debug(
          `[UIController] React DevTools ${ext.version} downloaded; will load on next launch`,
        );
      })
      .catch((err) => {
        logger.warn(
          '[UIController] Background React DevTools download failed:',
          err,
        );
      });
  }
}

// These are injected by the build system
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export interface UIControllerEventMap {
  uiReady: [];
  viewRecreated: [oldView: WebContentsView, newView: WebContentsView];
  createTab: [url?: string, setActive?: boolean];
  closeTab: [tabId: string];
  switchTab: [tabId: string];
  reorderTabs: [tabIds: string[]];
  layoutUpdate: [
    bounds: { x: number; y: number; width: number; height: number } | null,
  ];
  movePanelToForeground: [panel: 'stagewise-ui' | 'tab-content'];
  togglePanelKeyboardFocus: [panel: 'stagewise-ui' | 'tab-content'];
  stop: [tabId?: string];
  reload: [tabId?: string];
  trustCertificateAndReload: [tabId: string, origin: string];
  goto: [url: string, tabId?: string, transition?: PageTransition];
  goBack: [tabId?: string];
  goForward: [tabId?: string];
  // DevTools events are handled by DevToolAPIService
  setAudioMuted: [muted: boolean, tabId?: string];
  toggleAudioMuted: [tabId?: string];
  setColorScheme: [scheme: ColorScheme, tabId?: string];
  cycleColorScheme: [tabId?: string];
  setZoomPercentage: [percentage: number, tabId?: string];
  setContextSelectionMode: [active: boolean];
  setContextSelectionMouseCoordinates: [x: number, y: number];
  clearContextSelectionMouseCoordinates: [];
  passthroughWheelEvent: [
    event: {
      type: 'wheel';
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
    },
  ];
  selectHoveredElement: [];
  removeElement: [elementId: string];
  clearElements: [];
  restoreElements: [elements: SelectedElement[]];
  clearPendingScreenshots: [];
  scrollToElement: [tabId: string, backendNodeId: number, frameId: string];
  checkFrameValidity: [
    tabId: string,
    frameId: string,
    expectedFrameLocation: string,
  ];
  startSearchInPage: [searchText: string, tabId?: string];
  updateSearchInPageText: [searchText: string, tabId?: string];
  nextSearchResult: [tabId?: string];
  previousSearchResult: [tabId?: string];
  stopSearchInPage: [tabId?: string];
  activateSearchBar: [];
  deactivateSearchBar: [];
  // Permission handling events
  acceptPermission: [requestId: string];
  rejectPermission: [requestId: string];
  alwaysAllowPermission: [requestId: string];
  alwaysBlockPermission: [requestId: string];
  selectPermissionDevice: [requestId: string, deviceId: string];
  respondToBluetoothPairing: [
    requestId: string,
    confirmed: boolean,
    pin?: string,
  ];
  // Authentication handling events
  submitAuthCredentials: [
    requestId: string,
    username: string,
    password: string,
  ];
  cancelAuth: [requestId: string];
}

export class UIController extends EventEmitter<UIControllerEventMap> {
  private view: WebContentsView;
  private logger: Logger;
  private telemetryService: TelemetryService | null;
  private crashCount = 0;
  public readonly uiKarton: KartonService;
  private checkFrameValidityHandler?: (
    tabId: string,
    frameId: string,
    expectedFrameLocation: string,
  ) => Promise<boolean>;
  private checkElementExistsHandler?: (
    tabId: string,
    backendNodeId: number,
    frameId: string,
  ) => Promise<boolean>;

  /**
   * Creates a new UIController instance with React DevTools installed.
   * This must be used instead of the constructor to ensure DevTools are loaded
   * on the session before the WebContentsView is created.
   */
  public static async create(
    logger: Logger,
    telemetryService?: TelemetryService,
  ): Promise<UIController> {
    await installReactDevToolsOnUISession(logger);
    return new UIController(logger, telemetryService);
  }

  /**
   * Creates a new UIController instance.
   * Use the static `create()` method instead of calling this directly.
   */
  private constructor(logger: Logger, telemetryService?: TelemetryService) {
    super();
    this.logger = logger;
    this.telemetryService = telemetryService ?? null;
    this.uiKarton = new KartonService(logger);

    this.registerAttachmentProtocol();
    this.registerWorkspaceFileProtocol();
    this.registerAppProtocol();
    this.view = this.createView();
    this.loadApp();
    this.registerKartonProcedures();
  }

  /**
   * Register the attachment:// protocol handler on the UI session so
   * renderer components can display agent attachments via simple URLs.
   * URL format: attachment://{agentId}/{attachmentId}
   */
  private registerAttachmentProtocol(): void {
    const uiSession = session.fromPartition(UI_SESSION_PARTITION);
    uiSession.protocol.handle('attachment', async (request) => {
      try {
        const url = new URL(request.url);
        const agentId = url.hostname;
        const attachmentId = url.pathname.replace(/^\//, '');

        if (!agentId || !attachmentId) {
          return new Response('Invalid attachment URL', { status: 400 });
        }

        const exists = await blobExists(agentId, attachmentId);
        if (!exists) {
          return new Response('Attachment not found', { status: 404 });
        }

        const mediaType = this.resolveAttachmentMediaType(
          agentId,
          attachmentId,
        );

        const filePath = getBlobPath(agentId, attachmentId);
        const fileUrl = pathToFileURL(filePath).href;
        const fileResponse = await net.fetch(fileUrl);

        return new Response(fileResponse.body, {
          status: 200,
          headers: { 'Content-Type': mediaType },
        });
      } catch (err) {
        this.logger.error('[UIController] attachment protocol error', {
          error: err,
          url: request.url,
        });
        return new Response('Internal error', { status: 500 });
      }
    });
  }

  /**
   * Register the workspace:// protocol handler on the UI session so
   * renderer components can display workspace file previews via URLs.
   * URL format: workspace://{mountPrefix}/{relativePath}
   */
  private registerWorkspaceFileProtocol(): void {
    const uiSession = session.fromPartition(UI_SESSION_PARTITION);
    uiSession.protocol.handle('workspace', async (request) => {
      try {
        const url = new URL(request.url);
        const mountPrefix = url.hostname;
        const relativePath = decodeURIComponent(
          url.pathname.replace(/^\//, ''),
        );

        if (!mountPrefix || !relativePath)
          return new Response('Invalid workspace URL', { status: 400 });

        const workspaceRoot = this.findMountPath(mountPrefix);
        if (!workspaceRoot)
          return new Response('Mount not found', { status: 404 });

        const absolutePath = path.resolve(workspaceRoot, relativePath);
        if (!absolutePath.startsWith(workspaceRoot + path.sep))
          return new Response('Path traversal denied', { status: 400 });

        const mime = inferMimeType(relativePath);
        const fileUrl = pathToFileURL(absolutePath).href;
        const fileResponse = await net.fetch(fileUrl);

        return new Response(fileResponse.body, {
          status: 200,
          headers: { 'Content-Type': mime },
        });
      } catch (err) {
        this.logger.error('[UIController] workspace protocol error', {
          error: err,
          url: request.url,
        });
        return new Response('Internal error', { status: 500 });
      }
    });
  }

  /**
   * Register the app:// protocol handler on the UI session so
   * agent-created and plugin-provided apps can be served in iframes.
   *
   * URL format:
   *   app://agents/{agentId}/{appId}/{relativePath}
   *   app://plugins/{pluginId}/{appId}/{relativePath}
   */
  private registerAppProtocol(): void {
    const uiSession = session.fromPartition(UI_SESSION_PARTITION);

    uiSession.protocol.handle('app', async (request) => {
      try {
        const url = new URL(request.url);
        const namespace = url.hostname;
        const pathParts = decodeURIComponent(
          url.pathname.replace(/^\//, ''),
        ).split('/');

        const entityId = pathParts[0];
        const appId = pathParts[1];
        const relativePath = pathParts.slice(2).join('/');

        if (!entityId || !appId || !relativePath)
          return new Response('Invalid app URL', { status: 400 });

        let appDir: string;
        if (namespace === 'agents')
          appDir = path.join(getAgentAppsDir(entityId), appId);
        else if (namespace === 'plugins')
          appDir = path.join(getPluginsPath(), entityId, 'apps', appId);
        else return new Response('Unknown app namespace', { status: 400 });

        const absolutePath = path.resolve(appDir, relativePath);
        if (!absolutePath.startsWith(appDir + path.sep))
          return new Response('Path traversal denied', { status: 400 });

        try {
          await fs.access(absolutePath);
        } catch {
          return new Response('File not found', { status: 404 });
        }

        const mime = inferMimeType(relativePath);
        const fileUrl = pathToFileURL(absolutePath).href;
        const fileResponse = await net.fetch(fileUrl);

        if (mime === 'text/html') {
          const html = await fileResponse.text();
          const snippet =
            '<style>*,*::before,*::after{scrollbar-width:thin;scrollbar-color:var(--color-surface-2,rgba(255,255,255,.15)) transparent}</style>';
          const patched = html.includes('</head>')
            ? html.replace('</head>', `${snippet}</head>`)
            : `${snippet}${html}`;
          return new Response(patched, {
            status: 200,
            headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' },
          });
        }

        return new Response(fileResponse.body, {
          status: 200,
          headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' },
        });
      } catch (err) {
        this.logger.error('[UIController] app protocol error', {
          error: err,
          url: request.url,
        });
        return new Response('Internal error', { status: 500 });
      }
    });
  }

  /**
   * Find the absolute workspace path for a mount prefix by scanning
   * all agents' toolbox mounts in Karton state.
   */
  private findMountPath(prefix: string): string | null {
    for (const agentId in this.uiKarton.state.toolbox) {
      const mounts = this.uiKarton.state.toolbox[agentId]?.workspace?.mounts;
      if (!mounts) continue;
      for (const m of mounts) if (m.prefix === prefix) return m.path;
    }
    return null;
  }

  /**
   * Resolve the MIME type for an attachment by searching the agent's
   * chat history. Checks user-uploaded attachments first, then
   * sandbox-produced tool output attachments.
   */
  private resolveAttachmentMediaType(
    agentId: string,
    attachmentId: string,
  ): string {
    const history =
      this.uiKarton.state.agents.instances[agentId]?.state.history;
    if (!history) return 'application/octet-stream';

    return (
      findMediaTypeInUserAttachments(history, attachmentId) ??
      findMediaTypeInSandboxOutputs(history, attachmentId) ??
      'application/octet-stream'
    );
  }

  /**
   * Creates a new WebContentsView for the UI with all event handlers attached.
   * Used both during initial construction and crash recovery.
   */
  private createView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          'ui-preload/index.js',
        ),
        partition: UI_SESSION_PARTITION,
      },
    });

    view.setBackgroundColor('#00000000');

    // Intercept non-http navigations in the UI frame (e.g. stagewise://reveal-file/)
    view.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('stagewise://reveal-file/')) {
        event.preventDefault();
        const filePath = url
          .replace('stagewise://reveal-file/', '')
          .replace(/:\d+$/, '');
        this.logger.debug(
          `[UIController] Revealing file in folder: ${filePath}`,
        );
        shell.showItemInFolder(filePath);
      }
    });

    view.webContents.setWindowOpenHandler((details) => {
      // Intercept stagewise://reveal-file/ to show file in native file manager
      if (details.url.startsWith('stagewise://reveal-file/')) {
        const filePath = details.url
          .replace('stagewise://reveal-file/', '')
          .replace(/:\d+$/, '');
        this.logger.debug(
          `[UIController] Revealing file in folder: ${filePath}`,
        );
        shell.showItemInFolder(filePath);
        return { action: 'deny' };
      }

      // Check if the browser can handle this URL's protocol
      if (!canBrowserHandleUrl(details.url)) {
        // Open in external application (mailto:, tel:, vscode:, etc.)
        this.logger.debug(
          `[UIController] Opening URL with external handler: ${details.url}`,
        );
        if (details.url.startsWith('file://')) {
          const filePath = fileURLToPath(details.url).replace(/:\d+$/, '');
          shell.showItemInFolder(filePath);
        } else shell.openExternal(details.url);

        return { action: 'deny' };
      }

      // Check disposition to determine if tab should be opened in background
      // disposition can be: 'default', 'foreground-tab', 'background-tab', 'new-window', etc.
      const setActive = details.disposition !== 'background-tab';
      this.emit('createTab', details.url, setActive);
      return { action: 'deny' };
    });

    contextMenu({
      showSaveImage: false,
      showSaveImageAs: false,
      showCopyLink: false,
      showSearchWithGoogle: false,
      showSelectAll: false,
      showServices: false,
      showLookUpSelection: false,
      showInspectElement: false,
      window: view.webContents,
    });

    if (process.env.NODE_ENV === 'development') {
      view.webContents.openDevTools();
    }

    // Listen for the UI finishing load to ensure proper rendering
    view.webContents.once('did-finish-load', () => {
      this.logger.debug(
        '[UIController] UI finished loading, invalidating view',
      );
      // Force a repaint after UI loads to prevent invisible UI bug
      const bounds = this.view.getBounds();
      this.view.setBounds({ ...bounds });
      // Emit event so WindowLayoutService can trigger initial layout check
      this.emit('uiReady');
    });

    // Auto-recover from renderer crashes by replacing the entire WebContentsView.
    // Reloading a crashed WebContentsView fails with "Observers can only be added once!"
    // because Chromium's internal state is corrupted after a crash.
    view.webContents.on('render-process-gone', (_event, details) => {
      this.crashCount++;

      // Collect diagnostic info while webContents may still be queryable
      const diagnostics = {
        reason: details.reason,
        exitCode: details.exitCode,
        crashCount: this.crashCount,
        webContentsId: view.webContents.id,
        isDestroyed: view.webContents.isDestroyed(),
        processId: view.webContents.getOSProcessId(),
        url: (() => {
          try {
            return view.webContents.getURL();
          } catch {
            return '<unavailable>';
          }
        })(),
      };

      this.logger.error(
        `[UIController] UI renderer process gone: ${JSON.stringify(diagnostics)}`,
      );

      // Report to PostHog for tracking
      if (this.telemetryService) {
        this.telemetryService.captureException(
          new Error(
            `UI renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`,
          ),
          {
            service: 'UIController',
            operation: 'render-process-gone',
            ...diagnostics,
          },
        );
      }

      // Don't attempt recovery if the process was intentionally killed (e.g. app closing)
      if (details.reason === 'clean-exit') return;

      // Prevent infinite crash loops — if the UI crashes too many times in a row,
      // stop attempting recovery
      if (this.crashCount > 5) {
        this.logger.error(
          '[UIController] Too many consecutive crashes, giving up on recovery',
        );
        return;
      }

      this.logger.info(
        '[UIController] Recovering from crash by replacing WebContentsView...',
      );
      const oldView = this.view;
      const bounds = oldView.getBounds();

      // Create a fresh view (all event handlers are re-attached inside createView)
      const newView = this.createView();
      newView.setBounds(bounds);
      this.view = newView;

      // Notify WindowLayoutService to swap the views in the BaseWindow hierarchy
      this.emit('viewRecreated', oldView, newView);

      // Load the app on the new view
      this.loadApp();
    });

    return view;
  }

  private loadApp() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.view.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.view.webContents.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }
    this.logger.debug('[UIController] UI content view loaded');
  }

  private registerKartonProcedures() {
    this.uiKarton.registerServerProcedureHandler(
      'browser.createTab',
      async (_callingClientId: string, url?: string, setActive?: boolean) => {
        this.emit('createTab', url, setActive);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.closeTab',
      async (_callingClientId: string, tabId: string) => {
        this.emit('closeTab', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.switchTab',
      async (_callingClientId: string, tabId: string) => {
        this.emit('switchTab', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.reorderTabs',
      async (_callingClientId: string, tabIds: string[]) => {
        this.emit('reorderTabs', tabIds);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.update',
      async (
        _callingClientId: string,
        bounds: { x: number; y: number; width: number; height: number } | null,
      ) => {
        this.emit('layoutUpdate', bounds);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.movePanelToForeground',
      async (
        _callingClientId: string,
        panel: 'stagewise-ui' | 'tab-content',
      ) => {
        this.emit('movePanelToForeground', panel);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.togglePanelKeyboardFocus',
      async (
        _callingClientId: string,
        panel: 'stagewise-ui' | 'tab-content',
      ) => {
        this.emit('togglePanelKeyboardFocus', panel);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.stop',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('stop', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.reload',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('reload', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.trustCertificateAndReload',
      async (_callingClientId: string, tabId: string, origin: string) => {
        this.emit('trustCertificateAndReload', tabId, origin);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goto',
      async (
        _callingClientId: string,
        url: string,
        tabId?: string,
        transition?: PageTransition,
      ) => {
        this.emit('goto', url, tabId, transition);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goBack',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('goBack', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goForward',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('goForward', tabId);
      },
    );
    // DevTools procedures are registered by DevToolAPIService
    this.uiKarton.registerServerProcedureHandler(
      'browser.setAudioMuted',
      async (_callingClientId: string, muted: boolean, tabId?: string) => {
        this.emit('setAudioMuted', muted, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.toggleAudioMuted',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('toggleAudioMuted', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.setColorScheme',
      async (_callingClientId: string, scheme: ColorScheme, tabId?: string) => {
        this.emit('setColorScheme', scheme, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.cycleColorScheme',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('cycleColorScheme', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.setZoomPercentage',
      async (_callingClientId: string, percentage: number, tabId?: string) => {
        this.emit('setZoomPercentage', percentage, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.setActive',
      async (_callingClientId: string, active: boolean) => {
        this.emit('setContextSelectionMode', active);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.setMouseCoordinates',
      async (_callingClientId: string, x: number, y: number) => {
        this.emit('setContextSelectionMouseCoordinates', x, y);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.clearMouseCoordinates',
      async (_callingClientId: string) => {
        this.emit('clearContextSelectionMouseCoordinates');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.passthroughWheelEvent',
      async (_callingClientId: string, event) => {
        this.emit('passthroughWheelEvent', event);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.selectHoveredElement',
      async (_callingClientId: string) => {
        // TODO: Implement by adding the element to the chat state controller.
        this.emit('selectHoveredElement');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.removeElement',
      async (_callingClientId: string, elementId: string) => {
        this.emit('removeElement', elementId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.clearElements',
      async (_callingClientId: string) => {
        this.emit('clearElements');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.restoreElements',
      async (_callingClientId: string, elements: SelectedElement[]) => {
        this.emit('restoreElements', elements);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.clearPendingScreenshots',
      async (_callingClientId: string) => {
        this.emit('clearPendingScreenshots');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.scrollToElement',
      async (
        _callingClientId: string,
        tabId: string,
        backendNodeId: number,
        frameId: string,
      ) => {
        this.emit('scrollToElement', tabId, backendNodeId, frameId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.checkFrameValidity',
      async (
        _callingClientId: string,
        tabId: string,
        frameId: string,
        expectedFrameLocation: string,
      ) => {
        if (this.checkFrameValidityHandler) {
          return await this.checkFrameValidityHandler(
            tabId,
            frameId,
            expectedFrameLocation,
          );
        }
        return false;
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.checkElementExists',
      async (
        _callingClientId: string,
        tabId: string,
        backendNodeId: number,
        frameId: string,
      ) => {
        if (this.checkElementExistsHandler) {
          return await this.checkElementExistsHandler(
            tabId,
            backendNodeId,
            frameId,
          );
        }
        return false;
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.start',
      async (_callingClientId: string, searchText: string, tabId?: string) => {
        this.emit('startSearchInPage', searchText, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.updateText',
      async (_callingClientId: string, searchText: string, tabId?: string) => {
        this.emit('updateSearchInPageText', searchText, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.next',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('nextSearchResult', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.previous',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('previousSearchResult', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.stop',
      async (_callingClientId: string, tabId?: string) => {
        this.emit('stopSearchInPage', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchBar.activate',
      async (_callingClientId: string) => {
        this.emit('activateSearchBar');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchBar.deactivate',
      async (_callingClientId: string) => {
        this.emit('deactivateSearchBar');
      },
    );

    // Permission handling procedures
    this.uiKarton.registerServerProcedureHandler(
      'browser.permissions.accept',
      async (_callingClientId: string, requestId: string) => {
        this.emit('acceptPermission', requestId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.permissions.reject',
      async (_callingClientId: string, requestId: string) => {
        this.emit('rejectPermission', requestId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.permissions.selectDevice',
      async (_callingClientId: string, requestId: string, deviceId: string) => {
        this.emit('selectPermissionDevice', requestId, deviceId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.permissions.respondToPairing',
      async (
        _callingClientId: string,
        requestId: string,
        confirmed: boolean,
        pin?: string,
      ) => {
        this.emit('respondToBluetoothPairing', requestId, confirmed, pin);
      },
    );

    // "Always" permission responses - saves to preferences for future requests
    this.uiKarton.registerServerProcedureHandler(
      'browser.permissions.alwaysAllow',
      async (_callingClientId: string, requestId: string) => {
        this.emit('alwaysAllowPermission', requestId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.permissions.alwaysBlock',
      async (_callingClientId: string, requestId: string) => {
        this.emit('alwaysBlockPermission', requestId);
      },
    );

    // Authentication handling procedures
    this.uiKarton.registerServerProcedureHandler(
      'browser.auth.submit',
      async (
        _callingClientId: string,
        requestId: string,
        username: string,
        password: string,
      ) => {
        this.emit('submitAuthCredentials', requestId, username, password);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.auth.cancel',
      async (_callingClientId: string, requestId: string) => {
        this.emit('cancelAuth', requestId);
      },
    );
  }

  public forwardFocusEvent(tabId: string) {
    this.view.webContents.send('stagewise-tab-focused', tabId);
  }

  public forwardKeyDownEvent(key: SerializableKeyboardEvent) {
    const electronKeyCode = domCodeToElectronKeyCode(key.code, key.key);
    const modifiers = [
      key.ctrlKey ? ('control' as const) : undefined,
      key.altKey ? ('alt' as const) : undefined,
      key.shiftKey ? ('shift' as const) : undefined,
      key.metaKey ? ('meta' as const) : undefined,
    ].filter(Boolean) as ('control' | 'alt' | 'shift' | 'meta')[];

    this.view.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: electronKeyCode,
      modifiers,
    });
  }

  public setCheckFrameValidityHandler(
    handler: (
      tabId: string,
      frameId: string,
      expectedFrameLocation: string,
    ) => Promise<boolean>,
  ) {
    this.checkFrameValidityHandler = handler;
  }

  public setCheckElementExistsHandler(
    handler: (
      tabId: string,
      backendNodeId: number,
      frameId: string,
    ) => Promise<boolean>,
  ) {
    this.checkElementExistsHandler = handler;
  }

  public unregisterKartonProcedures() {
    this.uiKarton.removeServerProcedureHandler('browser.createTab');
    this.uiKarton.removeServerProcedureHandler('browser.closeTab');
    this.uiKarton.removeServerProcedureHandler('browser.switchTab');
    this.uiKarton.removeServerProcedureHandler('browser.reorderTabs');
    this.uiKarton.removeServerProcedureHandler('browser.layout.update');
    this.uiKarton.removeServerProcedureHandler(
      'browser.layout.movePanelToForeground',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.layout.togglePanelKeyboardFocus',
    );
    this.uiKarton.removeServerProcedureHandler('browser.stop');
    this.uiKarton.removeServerProcedureHandler('browser.reload');
    this.uiKarton.removeServerProcedureHandler(
      'browser.trustCertificateAndReload',
    );
    this.uiKarton.removeServerProcedureHandler('browser.goto');
    this.uiKarton.removeServerProcedureHandler('browser.goBack');
    this.uiKarton.removeServerProcedureHandler('browser.goForward');
    // DevTools procedure handlers are removed by DevToolAPIService
    this.uiKarton.removeServerProcedureHandler('browser.setAudioMuted');
    this.uiKarton.removeServerProcedureHandler('browser.toggleAudioMuted');
    this.uiKarton.removeServerProcedureHandler('browser.setColorScheme');
    this.uiKarton.removeServerProcedureHandler('browser.cycleColorScheme');
    this.uiKarton.removeServerProcedureHandler('browser.setZoomPercentage');
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.setActive',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.setMouseCoordinates',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.selectHoveredElement',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.removeElement',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.clearElements',
    );
    // Note: Removing handlers by reference is tricky if we use arrow functions or inline handlers.
    // The karton service implementation likely matches by name or needs exact reference.
    // Assuming we might just need to unregister all or handle lifecycle properly.
    // For now, since these are anonymous, removal might not work perfectly unless we store references.
    // However, UIController is likely long-lived or destroyed on app exit.
  }

  public getView(): WebContentsView {
    return this.view;
  }

  public setBounds(bounds: Electron.Rectangle) {
    this.view.setBounds(bounds);
  }

  public toggleDevTools() {
    this.view.webContents.toggleDevTools();
  }

  public focus() {
    this.view.webContents.focus();
  }
}
