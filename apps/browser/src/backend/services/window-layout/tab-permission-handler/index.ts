import type { WebContents, BluetoothDevice } from 'electron';
import type { Logger } from '../../logger';
import type {
  PermissionRequest,
  PermissionRequestType,
  MediaType,
  BluetoothDeviceInfo,
  HIDDeviceInfo,
  SerialPortInfo,
  USBDeviceInfo,
} from '@shared/karton-contracts/ui';
import { randomUUID } from 'node:crypto';

/**
 * Response types for resolving permission requests
 */
export type PermissionResponse =
  | { granted: boolean }
  | { granted: true; deviceId: string }
  | { granted: true; pin: string }
  | { granted: false };

/**
 * Pending request with callback(s) for resolution.
 * Multiple callbacks can accumulate if the same permission is requested multiple times.
 */
interface PendingRequest {
  request: PermissionRequest;
  /** All callbacks waiting for this permission - we resolve ALL of them */
  resolvers: Array<(response: PermissionResponse) => void>;
  /** For Bluetooth: interval for device list updates */
  updateInterval?: NodeJS.Timeout;
  /** For Bluetooth: reference to devices array for live updates */
  devicesRef?: BluetoothDevice[];
  /** For Bluetooth: Set of device IDs currently in the live devices array (for freshness filtering) */
  currentDeviceIds?: Set<string>;
}

/**
 * Callbacks for TabPermissionHandler to communicate state changes
 */
export interface TabPermissionHandlerCallbacks {
  /** Called when permission requests array changes */
  onPermissionRequestsUpdate: (requests: PermissionRequest[]) => void;
}

/**
 * TabPermissionHandler manages permission requests for a browser tab.
 *
 * Responsibilities:
 * - Listen to webContents permission events (Bluetooth device selection)
 * - Receive routed session-level permission requests from SessionPermissionRegistry
 * - Maintain queue of pending requests synced to UI via Karton
 * - Handle user responses (accept/reject/select device)
 * - Clean up resolved requests from UI state
 */
export class TabPermissionHandler {
  private readonly tabId: string;
  private readonly webContents: WebContents;
  private readonly logger: Logger;
  private readonly callbacks: TabPermissionHandlerCallbacks;

  /** Map of request ID to pending request with callbacks */
  private pendingRequests: Map<string, PendingRequest> = new Map();

  /** Bluetooth device list update interval (200ms) */
  private readonly BLUETOOTH_UPDATE_INTERVAL_MS = 200;

  // Bound event handlers for cleanup
  private boundHandleSelectBluetoothDevice: (
    event: Electron.Event,
    devices: BluetoothDevice[],
    callback: (deviceId: string) => void,
  ) => void;
  private boundHandleDidNavigate: (event: Electron.Event, url: string) => void;
  private boundHandleDidNavigateInPage: (
    event: Electron.Event,
    url: string,
    isMainFrame: boolean,
  ) => void;

  /** Track the current origin to detect origin changes */
  private currentOrigin: string;

  constructor(
    tabId: string,
    webContents: WebContents,
    logger: Logger,
    callbacks: TabPermissionHandlerCallbacks,
  ) {
    this.tabId = tabId;
    this.webContents = webContents;
    this.logger = logger;
    this.callbacks = callbacks;

    // Initialize current origin
    this.currentOrigin = this.getOrigin();

    // Bind event handlers
    this.boundHandleSelectBluetoothDevice =
      this.handleSelectBluetoothDevice.bind(this);
    this.boundHandleDidNavigate = this.handleDidNavigate.bind(this);
    this.boundHandleDidNavigateInPage = this.handleDidNavigateInPage.bind(this);

    this.setupEventListeners();
  }

  /** Get the webContents ID for routing */
  public get webContentsId(): number {
    return this.webContents.id;
  }

  private setupEventListeners(): void {
    // WebContents-level: Bluetooth device selection
    this.webContents.on(
      'select-bluetooth-device',
      this.boundHandleSelectBluetoothDevice,
    );

    // Navigation events: clear requests when origin changes or page is destroyed
    this.webContents.on('did-navigate', this.boundHandleDidNavigate);
    this.webContents.on(
      'did-navigate-in-page',
      this.boundHandleDidNavigateInPage,
    );
  }

  /**
   * Handle main frame navigation.
   * Clears all pending requests since the JS sandbox is destroyed.
   */
  private handleDidNavigate(_event: Electron.Event, url: string): void {
    const newOrigin = this.extractOriginFromUrl(url);

    // Navigation always destroys the JS sandbox, so cancel all requests
    // regardless of whether the origin changed
    if (this.pendingRequests.size > 0) {
      this.logger.debug(
        `[TabPermissionHandler] Navigation detected (${this.currentOrigin} -> ${newOrigin}), cancelling ${this.pendingRequests.size} pending requests`,
      );
      this.cancelAllRequests();
    }

    this.currentOrigin = newOrigin;
  }

  /**
   * Handle in-page navigation (hash changes, pushState, etc.).
   * Only clears requests if the origin actually changed (which shouldn't happen for in-page nav).
   */
  private handleDidNavigateInPage(
    _event: Electron.Event,
    url: string,
    isMainFrame: boolean,
  ): void {
    if (!isMainFrame) return;

    const newOrigin = this.extractOriginFromUrl(url);

    // In-page navigation typically doesn't change origin, but check just in case
    if (newOrigin !== this.currentOrigin && this.pendingRequests.size > 0) {
      this.logger.debug(
        `[TabPermissionHandler] Origin changed during in-page navigation (${this.currentOrigin} -> ${newOrigin}), cancelling ${this.pendingRequests.size} pending requests`,
      );
      this.cancelAllRequests();
      this.currentOrigin = newOrigin;
    }
  }

  /**
   * Cancel all pending requests (reject them).
   * Called when the page navigates and the JS sandbox is destroyed.
   */
  private cancelAllRequests(): void {
    const response: PermissionResponse = { granted: false };

    for (const pending of this.pendingRequests.values()) {
      // Clear any update intervals
      if (pending.updateInterval) {
        clearInterval(pending.updateInterval);
      }
      // Reject all waiting callbacks
      for (const resolver of pending.resolvers) {
        resolver(response);
      }
    }

    this.pendingRequests.clear();
    this.notifyRequestsUpdate();
  }

  /**
   * Extract origin from a URL string.
   */
  private extractOriginFromUrl(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Handle Bluetooth device selection request.
   * Creates a request entry and sets up 200ms device list updates.
   *
   * Deduplicates UI: if a Bluetooth request already exists, adds the callback
   * to the list (all will be resolved together) instead of creating duplicate UI.
   */
  private handleSelectBluetoothDevice(
    event: Electron.Event,
    devices: BluetoothDevice[],
    callback: (deviceId: string) => void,
  ): void {
    event.preventDefault();

    const resolver = (response: PermissionResponse) => {
      if (response.granted && 'deviceId' in response) {
        callback(response.deviceId);
      } else {
        callback('');
      }
    };

    // Check for existing Bluetooth request (deduplication)
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.type === 'bluetooth') {
        // Add this callback to the list - all will be resolved together
        pending.resolvers.push(resolver);
        pending.devicesRef = devices;
        // Create new request object with updated device list (objects may be frozen)
        pending.request = {
          ...pending.request,
          devices: this.mapBluetoothDevices(devices),
        };
        this.notifyRequestsUpdate();
        this.logger.debug(
          `[TabPermissionHandler] Deduplicated Bluetooth request, now ${pending.resolvers.length} callbacks waiting`,
        );
        return;
      }
    }

    // No existing request - create a new one
    const requestId = randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      timestamp: Date.now(),
      type: 'bluetooth',
      origin: this.getOrigin(),
      tabId: this.tabId,
      devices: this.mapBluetoothDevices(devices),
    };

    const pending: PendingRequest = {
      request,
      resolvers: [resolver],
      devicesRef: devices,
    };

    // Set up device list update interval (Electron updates devices array in-place)
    pending.updateInterval = setInterval(() => {
      this.updateBluetoothDeviceList(requestId);
    }, this.BLUETOOTH_UPDATE_INTERVAL_MS);

    this.pendingRequests.set(requestId, pending);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] Bluetooth device selection request created: ${requestId}`,
    );
  }

  /**
   * Update Bluetooth device list for a pending request.
   * Electron updates the devices array in-place as new devices are discovered.
   */
  private updateBluetoothDeviceList(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || pending.request.type !== 'bluetooth' || !pending.devicesRef)
      return;

    // Re-map devices from the live reference
    const newDevices = this.mapBluetoothDevices(pending.devicesRef);

    // Check if device list has changed
    const currentDevices = (
      pending.request as { devices: BluetoothDeviceInfo[] }
    ).devices;
    const hasChanged =
      newDevices.length !== currentDevices.length ||
      newDevices.some(
        (d, i) =>
          d.deviceId !== currentDevices[i]?.deviceId ||
          d.deviceName !== currentDevices[i]?.deviceName,
      );

    if (hasChanged) {
      // Create new request object with updated device list (objects may be frozen)
      pending.request = {
        ...pending.request,
        devices: newDevices,
      };
      this.notifyRequestsUpdate();
    }
  }

  /**
   * Handle routed permission request from SessionPermissionRegistry.
   * Used for session-level permissions (media, geolocation, etc.)
   *
   * Deduplicates UI: if a request for the same permission type already exists,
   * adds the callback to the list (all will be resolved together).
   */
  public handlePermissionRequest(
    permission: string,
    details: Record<string, unknown>,
    callback: (granted: boolean) => void,
  ): void {
    const permissionType = this.mapPermissionType(permission);

    if (!permissionType) {
      // Unknown permission type - auto-reject
      this.logger.warn(
        `[TabPermissionHandler] Unknown permission type: ${permission}`,
      );
      callback(false);
      return;
    }

    const resolver = (response: PermissionResponse) =>
      callback(response.granted);

    // Check for existing request of the same type (deduplication)
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.type === permissionType) {
        // Add this callback to the list - all will be resolved together
        pending.resolvers.push(resolver);
        this.logger.debug(
          `[TabPermissionHandler] Deduplicated ${permission} request, now ${pending.resolvers.length} callbacks waiting`,
        );
        return;
      }
    }

    // No existing request - create a new one
    const requestId = randomUUID();
    let request: PermissionRequest;

    if (permissionType === 'media') {
      // Media permission - extract mediaTypes
      request = {
        id: requestId,
        timestamp: Date.now(),
        type: 'media',
        origin: this.getOrigin(),
        tabId: this.tabId,
        mediaTypes: this.extractMediaTypes(details),
      };
    } else {
      // Simple yes/no permission
      request = {
        id: requestId,
        timestamp: Date.now(),
        type: permissionType as Exclude<
          PermissionRequestType,
          'media' | 'bluetooth' | 'bluetooth-pairing' | 'hid' | 'serial' | 'usb'
        >,
        origin: this.getOrigin(),
        tabId: this.tabId,
      };
    }

    const pending: PendingRequest = {
      request,
      resolvers: [resolver],
    };

    this.pendingRequests.set(requestId, pending);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] Permission request created: ${requestId} (${permission})`,
    );
  }

  /**
   * Handle HID device selection request from SessionPermissionRegistry.
   */
  public handleHIDDeviceSelectionRequest(
    devices: Array<{
      deviceId: string;
      vendorId: number;
      productId: number;
      productName?: string;
    }>,
    callback: (deviceId: string | null) => void,
  ): void {
    const resolver = (response: PermissionResponse) => {
      if (response.granted && 'deviceId' in response) {
        callback(response.deviceId);
      } else {
        callback(null);
      }
    };

    // Check for existing HID request (deduplication)
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.type === 'hid') {
        pending.resolvers.push(resolver);
        // Create new request object with updated device list (objects may be frozen)
        pending.request = {
          ...pending.request,
          devices: devices.map((d) => ({
            deviceId: d.deviceId,
            vendorId: d.vendorId,
            productId: d.productId,
            productName: d.productName || 'Unknown HID Device',
          })),
        };
        this.notifyRequestsUpdate();
        this.logger.debug(
          `[TabPermissionHandler] Deduplicated HID request, now ${pending.resolvers.length} callbacks waiting`,
        );
        return;
      }
    }

    const requestId = randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      timestamp: Date.now(),
      type: 'hid',
      origin: this.getOrigin(),
      tabId: this.tabId,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        vendorId: d.vendorId,
        productId: d.productId,
        productName: d.productName || 'Unknown HID Device',
      })),
    };

    const pending: PendingRequest = {
      request,
      resolvers: [resolver],
    };

    this.pendingRequests.set(requestId, pending);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] HID device selection request created: ${requestId}`,
    );
  }

  /**
   * Handle Serial port selection request from SessionPermissionRegistry.
   */
  public handleSerialPortSelectionRequest(
    ports: Array<{
      portId: string;
      portName?: string;
      displayName?: string;
    }>,
    callback: (portId: string) => void,
  ): void {
    const resolver = (response: PermissionResponse) => {
      if (response.granted && 'deviceId' in response) {
        callback(response.deviceId);
      } else {
        callback('');
      }
    };

    // Check for existing Serial request (deduplication)
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.type === 'serial') {
        pending.resolvers.push(resolver);
        // Create new request object with updated port list (objects may be frozen)
        pending.request = {
          ...pending.request,
          ports: ports.map((p) => ({
            portId: p.portId,
            portName: p.portName || 'Unknown Port',
            displayName: p.displayName || p.portName || 'Serial Port',
          })),
        };
        this.notifyRequestsUpdate();
        this.logger.debug(
          `[TabPermissionHandler] Deduplicated Serial request, now ${pending.resolvers.length} callbacks waiting`,
        );
        return;
      }
    }

    const requestId = randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      timestamp: Date.now(),
      type: 'serial',
      origin: this.getOrigin(),
      tabId: this.tabId,
      ports: ports.map((p) => ({
        portId: p.portId,
        portName: p.portName || 'Unknown Port',
        displayName: p.displayName || p.portName || 'Serial Port',
      })),
    };

    const pending: PendingRequest = {
      request,
      resolvers: [resolver],
    };

    this.pendingRequests.set(requestId, pending);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] Serial port selection request created: ${requestId}`,
    );
  }

  /**
   * Handle USB device selection request from SessionPermissionRegistry.
   */
  public handleUSBDeviceSelectionRequest(
    devices: Array<{
      deviceId: string;
      vendorId: number;
      productId: number;
      productName?: string;
      manufacturerName?: string;
    }>,
    callback: (deviceId: string | null) => void,
  ): void {
    const resolver = (response: PermissionResponse) => {
      if (response.granted && 'deviceId' in response) {
        callback(response.deviceId);
      } else {
        callback(null);
      }
    };

    // Check for existing USB request (deduplication)
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.type === 'usb') {
        pending.resolvers.push(resolver);
        // Create new request object with updated device list (objects may be frozen)
        pending.request = {
          ...pending.request,
          devices: devices.map((d) => ({
            deviceId: d.deviceId,
            vendorId: d.vendorId,
            productId: d.productId,
            productName: d.productName || 'Unknown USB Device',
            manufacturerName: d.manufacturerName,
          })),
        };
        this.notifyRequestsUpdate();
        this.logger.debug(
          `[TabPermissionHandler] Deduplicated USB request, now ${pending.resolvers.length} callbacks waiting`,
        );
        return;
      }
    }

    const requestId = randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      timestamp: Date.now(),
      type: 'usb',
      origin: this.getOrigin(),
      tabId: this.tabId,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        vendorId: d.vendorId,
        productId: d.productId,
        productName: d.productName || 'Unknown USB Device',
        manufacturerName: d.manufacturerName,
      })),
    };

    const pending: PendingRequest = {
      request,
      resolvers: [resolver],
    };

    this.pendingRequests.set(requestId, pending);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] USB device selection request created: ${requestId}`,
    );
  }

  /**
   * Handle Bluetooth pairing request from SessionPermissionRegistry.
   */
  public handleBluetoothPairingRequest(
    details: {
      deviceId: string;
      pairingKind: 'confirm' | 'confirmPin' | 'providePin';
      pin?: string;
    },
    callback: (response: { confirmed: boolean; pin?: string }) => void,
  ): void {
    const resolver = (response: PermissionResponse) => {
      if (response.granted) {
        callback({
          confirmed: true,
          pin: 'pin' in response ? response.pin : undefined,
        });
      } else {
        callback({ confirmed: false });
      }
    };

    // Check for existing Bluetooth pairing request (deduplication)
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.type === 'bluetooth-pairing') {
        pending.resolvers.push(resolver);
        this.logger.debug(
          `[TabPermissionHandler] Deduplicated Bluetooth pairing request, now ${pending.resolvers.length} callbacks waiting`,
        );
        return;
      }
    }

    const requestId = randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      timestamp: Date.now(),
      type: 'bluetooth-pairing',
      origin: this.getOrigin(),
      tabId: this.tabId,
      deviceId: details.deviceId,
      pairingKind: details.pairingKind,
      pin: details.pin,
    };

    const pending: PendingRequest = {
      request,
      resolvers: [resolver],
    };

    this.pendingRequests.set(requestId, pending);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] Bluetooth pairing request created: ${requestId}`,
    );
  }

  // === Public resolution methods (called from UI procedures) ===

  public acceptRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    // Resolve ALL waiting callbacks
    const response: PermissionResponse = { granted: true };
    for (const resolver of pending.resolvers) {
      resolver(response);
    }
    this.cleanupRequest(requestId);
  }

  public rejectRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    // Reject ALL waiting callbacks
    const response: PermissionResponse = { granted: false };
    for (const resolver of pending.resolvers) {
      resolver(response);
    }
    this.cleanupRequest(requestId);
  }

  public selectDevice(requestId: string, deviceId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    // Resolve ALL waiting callbacks with the selected device
    const response: PermissionResponse = { granted: true, deviceId };
    for (const resolver of pending.resolvers) {
      resolver(response);
    }
    this.cleanupRequest(requestId);
  }

  public respondToPairing(
    requestId: string,
    confirmed: boolean,
    pin?: string,
  ): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    // Resolve ALL waiting callbacks
    const response: PermissionResponse =
      confirmed && pin ? { granted: true, pin } : { granted: confirmed };
    for (const resolver of pending.resolvers) {
      resolver(response);
    }
    this.cleanupRequest(requestId);
  }

  // === Cleanup ===

  private cleanupRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending?.updateInterval) {
      clearInterval(pending.updateInterval);
    }
    this.pendingRequests.delete(requestId);
    this.notifyRequestsUpdate();

    this.logger.debug(
      `[TabPermissionHandler] Request resolved and cleaned up: ${requestId}`,
    );
  }

  private notifyRequestsUpdate(): void {
    const requests = Array.from(this.pendingRequests.values()).map(
      (p) => p.request,
    );
    this.callbacks.onPermissionRequestsUpdate(requests);
  }

  public destroy(): void {
    // Clear all intervals and reject all pending requests
    for (const pending of this.pendingRequests.values()) {
      if (pending.updateInterval) {
        clearInterval(pending.updateInterval);
      }
      // Reject ALL waiting callbacks
      const response: PermissionResponse = { granted: false };
      for (const resolver of pending.resolvers) {
        resolver(response);
      }
    }
    this.pendingRequests.clear();

    // Remove event listeners
    if (!this.webContents.isDestroyed()) {
      this.webContents.off(
        'select-bluetooth-device',
        this.boundHandleSelectBluetoothDevice,
      );
      this.webContents.off('did-navigate', this.boundHandleDidNavigate);
      this.webContents.off(
        'did-navigate-in-page',
        this.boundHandleDidNavigateInPage,
      );
    }

    this.logger.debug('[TabPermissionHandler] Destroyed');
  }

  // === Helper methods ===

  private getOrigin(): string {
    try {
      const url = this.webContents.getURL();
      return new URL(url).origin;
    } catch {
      return 'unknown';
    }
  }

  private mapPermissionType(permission: string): PermissionRequestType | null {
    const mapping: Record<string, PermissionRequestType> = {
      media: 'media',
      geolocation: 'geolocation',
      notifications: 'notifications',
      fullscreen: 'fullscreen',
      'clipboard-read': 'clipboard-read',
      'display-capture': 'display-capture',
      midi: 'midi',
      midiSysex: 'midi',
      'idle-detection': 'idle-detection',
      'speaker-selection': 'speaker-selection',
      'storage-access': 'storage-access',
      'top-level-storage-access': 'storage-access',
    };
    return mapping[permission] || null;
  }

  /**
   * Extract media types (camera/microphone) from Electron's details object.
   */
  private extractMediaTypes(details: Record<string, unknown>): MediaType[] {
    const mediaTypes = details.mediaTypes as string[] | undefined;
    if (!mediaTypes || !Array.isArray(mediaTypes)) {
      // Default to both if not specified
      return ['video', 'audio'];
    }
    return mediaTypes.filter(
      (t): t is MediaType => t === 'video' || t === 'audio',
    );
  }

  private mapBluetoothDevices(
    devices: BluetoothDevice[],
  ): BluetoothDeviceInfo[] {
    return devices.map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName || 'Unknown Device',
    }));
  }
}

export type {
  HIDDeviceInfo,
  SerialPortInfo,
  USBDeviceInfo,
  BluetoothDeviceInfo,
};
