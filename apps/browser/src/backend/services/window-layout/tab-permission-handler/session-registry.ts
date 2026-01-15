import {
  session,
  webContents,
  type Session,
  type WebFrameMain,
} from 'electron';
import type { Logger } from '../../logger';
import type { TabPermissionHandler } from './index';
import type { PreferencesService } from '../../preferences';
import {
  PermissionSetting,
  type ConfigurablePermissionType,
} from '@shared/karton-contracts/ui/shared-types';

/**
 * Permissions that are automatically granted without user prompt.
 * These are non-configurable permissions that browsers typically auto-grant.
 *
 * Note: fullscreen and midi were previously here but are now configurable
 * via user preferences, so they're handled by the preferences check first.
 */
const AUTO_GRANTED_PERMISSIONS = new Set([
  // Pointer lock - for games/3D apps, user can exit with Escape
  // Not configurable because it's transient and low-risk
  'pointerLock',

  // Window management - generally safe, not commonly exposed to users
  'window-management',
]);

/**
 * Check if a permission should be auto-granted without user prompt.
 * These are non-configurable permissions.
 */
function shouldAutoGrant(permission: string): boolean {
  return AUTO_GRANTED_PERMISSIONS.has(permission);
}

/**
 * Map Electron permission strings to our ConfigurablePermissionType.
 * Returns null for permissions that are not configurable.
 */
function mapToConfigurablePermission(
  permission: string,
): ConfigurablePermissionType | null {
  const mapping: Record<string, ConfigurablePermissionType> = {
    media: 'media',
    geolocation: 'geolocation',
    notifications: 'notifications',
    fullscreen: 'fullscreen',
    'clipboard-read': 'clipboard-read',
    'display-capture': 'display-capture',
    midi: 'midi',
    midiSysex: 'midi', // sysex variant maps to midi
    'idle-detection': 'idle-detection',
    'speaker-selection': 'speaker-selection',
    'storage-access': 'storage-access',
    'top-level-storage-access': 'storage-access', // variant maps to storage-access
  };
  return mapping[permission] ?? null;
}

/**
 * SessionPermissionRegistry manages session-level permission handlers
 * and routes requests to the appropriate TabPermissionHandler.
 *
 * This is a singleton because session handlers can only be set once per session.
 * It registers handlers on the 'persist:browser-content' partition used by tabs.
 */
export class SessionPermissionRegistry {
  private static instance: SessionPermissionRegistry | null = null;

  private readonly browserSession: Session;
  private readonly logger: Logger;

  /** Map of webContents ID to TabPermissionHandler */
  private handlers: Map<number, TabPermissionHandler> = new Map();

  /** PreferencesService for checking stored permission preferences */
  private preferencesService: PreferencesService | null = null;

  private constructor(logger: Logger) {
    this.logger = logger;
    this.browserSession = session.fromPartition('persist:browser-content');
    this.setupSessionHandlers();
  }

  public static initialize(logger: Logger): SessionPermissionRegistry {
    if (!SessionPermissionRegistry.instance) {
      SessionPermissionRegistry.instance = new SessionPermissionRegistry(
        logger,
      );
    }
    return SessionPermissionRegistry.instance;
  }

  public static getInstance(): SessionPermissionRegistry | null {
    return SessionPermissionRegistry.instance;
  }

  /**
   * Set the PreferencesService for checking stored permission preferences.
   * This must be called after PreferencesService is created (it's created after this singleton).
   */
  public setPreferencesService(preferencesService: PreferencesService): void {
    this.preferencesService = preferencesService;
    this.logger.debug(
      '[SessionPermissionRegistry] PreferencesService connected',
    );
  }

  /**
   * Register a TabPermissionHandler for routing.
   */
  public registerHandler(handler: TabPermissionHandler): void {
    this.handlers.set(handler.webContentsId, handler);
    this.logger.debug(
      `[SessionPermissionRegistry] Registered handler for webContents ${handler.webContentsId}`,
    );
  }

  /**
   * Unregister a TabPermissionHandler.
   */
  public unregisterHandler(webContentsId: number): void {
    this.handlers.delete(webContentsId);
    this.logger.debug(
      `[SessionPermissionRegistry] Unregistered handler for webContents ${webContentsId}`,
    );
  }

  private setupSessionHandlers(): void {
    // Permission Request Handler - routes to tab handlers or auto-grants
    this.browserSession.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        // Check if this permission should be auto-granted (non-configurable)
        if (shouldAutoGrant(permission)) {
          this.logger.debug(
            `[SessionPermissionRegistry] Auto-granting non-configurable permission: ${permission}`,
          );
          callback(true);
          return;
        }

        // Check stored preferences for configurable permissions
        const configurableType = mapToConfigurablePermission(permission);
        if (configurableType && this.preferencesService) {
          // Get the requesting origin
          const requestingUrl =
            (details as { requestingUrl?: string }).requestingUrl ?? '';
          let requestingOrigin: string | null = null;
          try {
            requestingOrigin = requestingUrl
              ? new URL(requestingUrl).origin
              : null;
          } catch {
            // Invalid URL, can't check preferences
          }

          if (requestingOrigin) {
            const setting = this.preferencesService.getPermissionSetting(
              requestingOrigin,
              configurableType,
            );

            if (setting === PermissionSetting.Allow) {
              this.logger.debug(
                `[SessionPermissionRegistry] Auto-allowing ${permission} for ${requestingOrigin} (stored preference)`,
              );
              callback(true);
              return;
            }

            if (setting === PermissionSetting.Block) {
              this.logger.debug(
                `[SessionPermissionRegistry] Auto-blocking ${permission} for ${requestingOrigin} (stored preference)`,
              );
              callback(false);
              return;
            }
            // PermissionSetting.Ask falls through to user prompt
          }
        }

        const handler = webContents ? this.handlers.get(webContents.id) : null;

        if (!handler) {
          // No handler registered - reject for security
          this.logger.debug(
            `[SessionPermissionRegistry] No handler for permission request: ${permission} (webContents: ${webContents?.id || 'null'})`,
          );
          callback(false);
          return;
        }

        // Route to the appropriate tab handler for user prompt
        handler.handlePermissionRequest(
          permission,
          details as unknown as Record<string, unknown>,
          callback,
        );
      },
    );

    // Permission Check Handler (synchronous check before request)
    this.browserSession.setPermissionCheckHandler(
      (_webContents, permission, requestingOrigin, details) => {
        // Auto-granted permissions pass the check immediately
        if (shouldAutoGrant(permission)) {
          return true;
        }

        // Block certain permissions for file:// origins (security)
        if (details.requestingUrl?.startsWith('file://')) {
          if (['hid', 'serial', 'usb'].includes(permission)) {
            return false;
          }
        }

        // Check stored preferences for configurable permissions
        const configurableType = mapToConfigurablePermission(permission);
        if (configurableType && this.preferencesService && requestingOrigin) {
          const setting = this.preferencesService.getPermissionSetting(
            requestingOrigin,
            configurableType,
          );

          // If explicitly blocked, return false to prevent the request
          if (setting === PermissionSetting.Block) {
            return false;
          }

          // If explicitly allowed, return true
          if (setting === PermissionSetting.Allow) {
            return true;
          }
        }

        // For other permissions, allow the check to pass so the request handler gets called
        return true;
      },
    );

    // Device Permission Handler (persistent device access)
    this.browserSession.setDevicePermissionHandler((_details) => {
      // For V1, we don't implement persistent device permissions
      // Return false to always require user approval
      return false;
    });

    // HID Device Selection
    this.browserSession.on('select-hid-device', (event, details, callback) => {
      event.preventDefault();

      // Find handler by frame
      const handler = this.findHandlerByFrame(details.frame);
      if (!handler) {
        this.logger.debug(
          '[SessionPermissionRegistry] No handler for HID device selection',
        );
        callback('');
        return;
      }

      handler.handleHIDDeviceSelectionRequest(
        details.deviceList.map((d) => ({
          deviceId: d.deviceId,
          vendorId: d.vendorId,
          productId: d.productId,
          productName: d.name,
        })),
        (deviceId) => callback(deviceId || ''),
      );
    });

    // Serial Port Selection
    this.browserSession.on(
      'select-serial-port',
      (event, portList, webContents, callback) => {
        event.preventDefault();

        const handler = this.handlers.get(webContents.id);
        if (!handler) {
          this.logger.debug(
            '[SessionPermissionRegistry] No handler for serial port selection',
          );
          callback(''); // Empty string to cancel
          return;
        }

        handler.handleSerialPortSelectionRequest(
          portList.map((p) => ({
            portId: p.portId,
            portName: p.portName,
            displayName: p.displayName,
          })),
          callback,
        );
      },
    );

    // USB Device Selection
    this.browserSession.on('select-usb-device', (event, details, callback) => {
      event.preventDefault();

      // Find handler by frame
      const handler = this.findHandlerByFrame(details.frame);
      if (!handler) {
        this.logger.debug(
          '[SessionPermissionRegistry] No handler for USB device selection',
        );
        callback('');
        return;
      }

      handler.handleUSBDeviceSelectionRequest(
        details.deviceList.map((d) => ({
          deviceId: d.deviceId,
          vendorId: d.vendorId,
          productId: d.productId,
          productName: d.productName,
          manufacturerName: d.manufacturerName,
        })),
        (deviceId) => callback(deviceId || ''),
      );
    });

    // Bluetooth Pairing Handler (Windows/Linux)
    this.browserSession.setBluetoothPairingHandler((details, callback) => {
      // Find handler by frame
      const handler = this.findHandlerByFrame(details.frame);
      if (!handler) {
        this.logger.debug(
          '[SessionPermissionRegistry] No handler for Bluetooth pairing',
        );
        callback({ confirmed: false });
        return;
      }

      handler.handleBluetoothPairingRequest(
        {
          deviceId: details.deviceId,
          pairingKind: details.pairingKind,
          pin: details.pin,
        },
        callback,
      );
    });

    this.logger.debug(
      '[SessionPermissionRegistry] Session handlers registered',
    );
  }

  /**
   * Find a handler by WebFrameMain reference.
   * Uses webContents.fromFrame() to get the associated webContents.
   */
  private findHandlerByFrame(
    frame: WebFrameMain | null | undefined,
  ): TabPermissionHandler | null {
    if (!frame) return null;
    // Get the top-level frame's webContents
    const topFrame = frame.top;
    if (!topFrame) return null;
    const wc = webContents.fromFrame(topFrame);
    if (!wc) return null;
    return this.handlers.get(wc.id) || null;
  }

  public destroy(): void {
    // Clear handlers by setting them to null
    this.browserSession.setPermissionRequestHandler(null);
    this.browserSession.setPermissionCheckHandler(null);
    this.browserSession.setDevicePermissionHandler(null);
    this.browserSession.setBluetoothPairingHandler(null);
    // Note: Cannot remove session event listeners, they persist until app closes
    // But we clear our handlers map so requests will be rejected

    this.handlers.clear();
    SessionPermissionRegistry.instance = null;

    this.logger.debug('[SessionPermissionRegistry] Destroyed');
  }
}
