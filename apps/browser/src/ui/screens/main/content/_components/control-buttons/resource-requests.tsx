import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconConnection2FillDuo18,
  IconCameraFillDuo18,
  IconMicrophone3FillDuo18,
  IconHardDriveFillDuo18,
  IconLocation2FillDuo18,
  IconBellDotFillDuo18,
  IconPresentationScreenVideoFillDuo18,
  IconClipboardContentFillDuo18,
  IconMusicFillDuo18,
  IconMsgSleepFillDuo18,
  IconDatabaseSearchFillDuo18,
  IconSpeakerFillDuo18,
} from 'nucleo-ui-fill-duo-18';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@stagewise/stage-ui/components/popover';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import {
  Collapsible,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';
import { Select } from '@stagewise/stage-ui/components/select';
import type {
  PermissionRequest,
  MediaPermissionRequest,
  BluetoothSelectionRequest,
  HIDSelectionRequest,
  SerialSelectionRequest,
  USBSelectionRequest,
  BluetoothPairingRequest,
} from '@shared/karton-contracts/ui';
import { IconCheckFill18, IconXmarkFill18 } from 'nucleo-ui-fill-18';
import { IconBluetoothOutline24 } from 'nucleo-core-outline-24';
import { IconUsbFill24 } from 'nucleo-core-fill-24';
import TimeAgo from 'react-timeago';

// ============================================================================
// Icon Rendering
// ============================================================================

const ICON_COLORS: Record<string, string> = {
  camera: 'text-cyan-600 dark:text-cyan-300',
  microphone: 'text-green-600 dark:text-green-300',
  bluetooth: 'text-blue-600 dark:text-blue-300',
  'bluetooth-pairing': 'text-blue-600 dark:text-blue-300',
  usb: 'text-orange-400',
  hid: 'text-purple-600 dark:text-purple-300',
  serial: 'text-yellow-300 dark:text-yellow-700',
  geolocation: 'text-fuchsia-600 dark:text-fuchsia-300',
  notifications: 'text-yellow-600 dark:text-yellow-300',
  fullscreen: 'text-indigo-600 dark:text-indigo-300',
  'display-capture': 'text-indigo-600 dark:text-indigo-300',
  'clipboard-read': 'text-teal-600 dark:text-teal-300',
  midi: 'text-pink-600 dark:text-pink-300',
  'idle-detection': 'text-violet-600 dark:text-violet-300',
  'speaker-selection': 'text-cyan-600 dark:text-cyan-300',
  'storage-access': 'text-amber-600 dark:text-amber-300',
};

function PermissionIcon({
  type,
  className = 'size-4',
}: {
  type: string;
  className?: string;
}) {
  const color = ICON_COLORS[type] ?? 'text-muted-foreground';
  const cn = `${className} ${color}`;

  switch (type) {
    case 'camera':
      return <IconCameraFillDuo18 className={cn} />;
    case 'microphone':
      return <IconMicrophone3FillDuo18 className={cn} />;
    case 'bluetooth':
    case 'bluetooth-pairing':
      return <IconBluetoothOutline24 className={cn} />;
    case 'usb':
      return <IconUsbFill24 className={cn} />;
    case 'hid':
      return <IconHardDriveFillDuo18 className={cn} />;
    case 'serial':
      return <IconDatabaseSearchFillDuo18 className={cn} />;
    case 'geolocation':
      return <IconLocation2FillDuo18 className={cn} />;
    case 'notifications':
      return <IconBellDotFillDuo18 className={cn} />;
    case 'fullscreen':
    case 'display-capture':
      return <IconPresentationScreenVideoFillDuo18 className={cn} />;
    case 'clipboard-read':
      return <IconClipboardContentFillDuo18 className={cn} />;
    case 'midi':
      return <IconMusicFillDuo18 className={cn} />;
    case 'idle-detection':
      return <IconMsgSleepFillDuo18 className={cn} />;
    case 'speaker-selection':
      return <IconSpeakerFillDuo18 className={cn} />;
    case 'storage-access':
      return <IconHardDriveFillDuo18 className={cn} />;
    default:
      return <IconConnection2FillDuo18 className={cn} />;
  }
}

/**
 * Get display icons for a request. Media requests can have camera + mic.
 */
function getRequestIcons(request: PermissionRequest): string[] {
  if (request.type === 'media') {
    const { mediaTypes } = request as MediaPermissionRequest;
    const icons: string[] = [];
    if (mediaTypes.includes('video')) icons.push('camera');
    if (mediaTypes.includes('audio')) icons.push('microphone');
    return icons.length > 0 ? icons : ['camera'];
  }
  return [request.type];
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRequestDescription(request: PermissionRequest): string {
  switch (request.type) {
    case 'media': {
      const { mediaTypes } = request as MediaPermissionRequest;
      const hasCamera = mediaTypes.includes('video');
      const hasMic = mediaTypes.includes('audio');
      if (hasCamera && hasMic) return 'wants to use your camera and microphone';
      if (hasCamera) return 'wants to use your camera';
      if (hasMic) return 'wants to use your microphone';
      return 'wants media access';
    }
    case 'geolocation':
      return 'wants to know your location';
    case 'notifications':
      return 'wants to send notifications';
    case 'fullscreen':
      return 'wants to enter fullscreen';
    case 'clipboard-read':
      return 'wants to read your clipboard';
    case 'display-capture':
      return 'wants to share your screen';
    case 'midi':
      return 'wants to access MIDI devices';
    case 'idle-detection':
      return 'wants to detect when you are idle';
    case 'speaker-selection':
      return 'wants to select audio output';
    case 'storage-access':
      return 'wants storage access';
    case 'bluetooth':
      return 'wants to connect to a Bluetooth device';
    case 'hid':
      return 'wants to connect to a HID device';
    case 'serial':
      return 'wants to connect to a serial port';
    case 'usb':
      return 'wants to connect to a USB device';
    case 'bluetooth-pairing':
      return 'wants to pair with a Bluetooth device';
    default:
      return 'is requesting access';
  }
}

/** Simple yes/no permission types (no device selection needed) */
const SIMPLE_REQUEST_TYPES = [
  'media',
  'geolocation',
  'notifications',
  'fullscreen',
  'clipboard-read',
  'display-capture',
  'midi',
  'idle-detection',
  'speaker-selection',
  'storage-access',
];

function isSimpleRequest(request: PermissionRequest): boolean {
  return SIMPLE_REQUEST_TYPES.includes(request.type);
}

function getDevicesFromRequest(
  request:
    | BluetoothSelectionRequest
    | HIDSelectionRequest
    | SerialSelectionRequest
    | USBSelectionRequest,
): { id: string; name: string }[] {
  switch (request.type) {
    case 'bluetooth':
      return request.devices.map((d) => ({
        id: d.deviceId,
        name: d.deviceName || 'Unknown Device',
      }));
    case 'hid':
      return request.devices.map((d) => ({
        id: d.deviceId,
        name: d.productName || 'HID Device',
      }));
    case 'serial':
      return request.ports.map((p) => ({
        id: p.portId,
        name: p.displayName || p.portName || 'Serial Port',
      }));
    case 'usb':
      return request.devices.map((d) => ({
        id: d.deviceId,
        name: d.productName || 'USB Device',
      }));
  }
}

// ============================================================================
// PermissionRequestRow Component
// ============================================================================

function PermissionRequestRow({
  request,
  onAccept,
  onReject,
  onSelectDevice,
}: {
  request: PermissionRequest;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onSelectDevice: (requestId: string, deviceId: string) => void;
}) {
  const icons = getRequestIcons(request);
  const description = getRequestDescription(request);
  const isSimple = isSimpleRequest(request);
  const isDeviceRequest = ['bluetooth', 'hid', 'serial', 'usb'].includes(
    request.type,
  );
  const devices = isDeviceRequest
    ? getDevicesFromRequest(
        request as
          | BluetoothSelectionRequest
          | HIDSelectionRequest
          | SerialSelectionRequest
          | USBSelectionRequest,
      )
    : [];
  const pairingRequest =
    request.type === 'bluetooth-pairing'
      ? (request as BluetoothPairingRequest)
      : null;

  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showPulse, setShowPulse] = useState(true);

  // Remove pulse animation after it completes
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = useCallback(() => {
    if (isSimple) {
      onAccept(request.id);
    } else if (selectedDevice) {
      onSelectDevice(request.id, selectedDevice);
    }
  }, [request.id, isSimple, selectedDevice, onAccept, onSelectDevice]);

  return (
    <div className="relative flex shrink-0 flex-col items-stretch gap-1 py-2">
      {/* Pulsing bg for new requests */}
      {showPulse && (
        <div className="-mx-1 pointer-events-none absolute inset-0 animate-pulse-full rounded-lg bg-primary/10" />
      )}
      {/* Header: icons + timestamp + close button */}
      <div className="flex w-full flex-row items-center justify-start gap-2">
        <div className="flex flex-row gap-1">
          {icons.map((icon) => (
            <PermissionIcon key={icon} type={icon} className="size-4" />
          ))}
        </div>
        <span className="text-muted-foreground text-xs">
          <TimeAgo date={request.timestamp} />
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-1"
          onClick={() => onReject(request.id)}
        >
          <IconXmarkFill18 className="size-3" />
        </Button>
      </div>

      {/* Content: description + device select + accept button */}
      <div className="flex flex-row items-end justify-between gap-4">
        <div className="flex flex-col items-stretch gap-0.5">
          <span className="text-foreground text-sm">
            <strong className="font-semibold">
              {new URL(request.origin).host}
            </strong>{' '}
            {description}
          </span>

          {/* Device selection for device-type requests */}
          {isDeviceRequest && (
            <div className="flex flex-col gap-1">
              {devices.length === 0 ? (
                <span className="pl-1 text-muted-foreground text-xs">
                  Searching for devices...
                </span>
              ) : (
                <Select
                  triggerClassName="mt-1 w-full max-w-full"
                  popupClassName="max-w-(--anchor-width)"
                  value={selectedDevice}
                  onValueChange={setSelectedDevice}
                  triggerVariant="secondary"
                  size="md"
                  placeholder="Select a device…"
                  items={devices.map((device) => ({
                    value: device.id,
                    label: device.name,
                    description: device.id,
                  }))}
                />
              )}
            </div>
          )}

          {/* Bluetooth pairing PIN display */}
          {pairingRequest?.pairingKind === 'confirmPin' &&
            pairingRequest.pin && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">PIN:</span>
                <span className="rounded-lg bg-surface-1 px-2 py-0.5 font-medium font-mono text-base tracking-widest">
                  {pairingRequest.pin}
                </span>
              </div>
            )}
        </div>

        <Button
          variant="primary"
          size="icon-sm"
          className="mb-1 shrink-0"
          disabled={!isSimple && !selectedDevice}
          onClick={handleAccept}
        >
          <IconCheckFill18 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ResourceRequestsControlButton({ tabId }: { tabId: string }) {
  const permissionRequests = useKartonState(
    (s) => s.browser.tabs[tabId]?.permissionRequests ?? [],
  );

  const acceptPermission = useKartonProcedure(
    (p) => p.browser.permissions.accept,
  );
  const rejectPermission = useKartonProcedure(
    (p) => p.browser.permissions.reject,
  );
  const selectDevice = useKartonProcedure(
    (p) => p.browser.permissions.selectDevice,
  );
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );

  const [isOpen, setIsOpen] = useState(false);
  const [urgentRequests, setUrgentRequests] = useState(false);

  // Refs to track previous request count and timeouts
  const prevRequestCountRef = useRef(permissionRequests.length);
  const urgentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoDismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringPopoverRef = useRef(false);
  const wasAutoOpenedRef = useRef(false);

  // Configurable timeout durations (ms)
  const URGENT_TIMEOUT_MS = 5000;
  const AUTO_DISMISS_TIMEOUT_MS = 10000;

  // Close popover when all requests are handled
  useEffect(() => {
    if (permissionRequests.length === 0) {
      setIsOpen(false);
    }
  }, [permissionRequests.length]);

  // Set urgent state and auto-open popover when new requests arrive
  useEffect(() => {
    const currentCount = permissionRequests.length;
    const prevCount = prevRequestCountRef.current;

    // New requests arrived
    if (currentCount > prevCount) {
      setUrgentRequests(true);

      // Clear existing urgent timeout if any
      if (urgentTimeoutRef.current) {
        clearTimeout(urgentTimeoutRef.current);
      }

      // Start new urgent timeout
      urgentTimeoutRef.current = setTimeout(() => {
        setUrgentRequests(false);
        urgentTimeoutRef.current = null;
      }, URGENT_TIMEOUT_MS);

      // Auto-open the popover and bring UI to foreground
      setIsOpen(true);
      wasAutoOpenedRef.current = true;
      void movePanelToForeground('stagewise-ui');

      // Clear existing auto-dismiss timeout if any
      if (autoDismissTimeoutRef.current) {
        clearTimeout(autoDismissTimeoutRef.current);
      }

      // Start auto-dismiss timer (will be cancelled if user hovers)
      autoDismissTimeoutRef.current = setTimeout(() => {
        if (!isHoveringPopoverRef.current) {
          setIsOpen(false);
        }
        autoDismissTimeoutRef.current = null;
        wasAutoOpenedRef.current = false;
      }, AUTO_DISMISS_TIMEOUT_MS);
    }

    // Update previous count
    prevRequestCountRef.current = currentCount;

    // Cleanup timeouts on unmount
    return () => {
      if (urgentTimeoutRef.current) {
        clearTimeout(urgentTimeoutRef.current);
      }
      if (autoDismissTimeoutRef.current) {
        clearTimeout(autoDismissTimeoutRef.current);
      }
    };
  }, [permissionRequests.length]);

  // Handlers for popover hover state
  const handlePopoverMouseEnter = useCallback(() => {
    isHoveringPopoverRef.current = true;
    // Cancel auto-dismiss when user hovers
    if (autoDismissTimeoutRef.current) {
      clearTimeout(autoDismissTimeoutRef.current);
      autoDismissTimeoutRef.current = null;
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    isHoveringPopoverRef.current = false;
    // If popover was auto-opened and user leaves, start dismiss timer again
    if (wasAutoOpenedRef.current && isOpen) {
      autoDismissTimeoutRef.current = setTimeout(() => {
        if (!isHoveringPopoverRef.current) {
          setIsOpen(false);
        }
        autoDismissTimeoutRef.current = null;
        wasAutoOpenedRef.current = false;
      }, AUTO_DISMISS_TIMEOUT_MS);
    }
  }, [isOpen]);

  const handleAccept = useCallback(
    (requestId: string) => void acceptPermission(requestId),
    [acceptPermission],
  );

  const handleReject = useCallback(
    (requestId: string) => void rejectPermission(requestId),
    [rejectPermission],
  );

  const handleSelectDevice = useCallback(
    (requestId: string, deviceId: string) =>
      void selectDevice(requestId, deviceId),
    [selectDevice],
  );

  // Get first few unique icon types for the button preview
  const previewIcons = useMemo(() => {
    const seen = new Set<string>();
    const icons: string[] = [];
    for (const request of permissionRequests) {
      for (const icon of getRequestIcons(request)) {
        if (!seen.has(icon) && icons.length < 3) {
          seen.add(icon);
          icons.push(icon);
        }
      }
    }
    return icons;
  }, [permissionRequests]);

  const tooltipText =
    permissionRequests.length === 0
      ? 'Permission Requests'
      : `${permissionRequests.length} permission${permissionRequests.length > 1 ? 's' : ''} requested`;

  const hasRequests = permissionRequests.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <Collapsible open={hasRequests}>
          <CollapsibleContent className="p-0 opacity-100 blur-none transition-all duration-150 ease-out data-ending-style:h-8! data-starting-style:h-8! data-ending-style:w-0 data-starting-style:w-0 data-ending-style:overflow-hidden data-starting-style:overflow-hidden data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:blur-sm data-starting-style:blur-sm">
            <TooltipTrigger>
              <PopoverTrigger>
                <Button
                  variant="ghost"
                  size="md"
                  className={`flex h-8 w-[calc-size(auto,size)] flex-row items-center gap-2 overflow-hidden rounded-full bg-surface-1 hover:bg-surface-1/80`}
                >
                  {urgentRequests && (
                    <div className="pointer-events-none absolute size-full animate-pulse-full bg-primary/10" />
                  )}
                  {previewIcons.map((icon) => (
                    <PermissionIcon key={icon} type={icon} className="size-4" />
                  ))}
                  {permissionRequests.length > previewIcons.length && (
                    <span className="select-none rounded-full bg-foreground/20 px-1.5 font-medium text-2xs text-foreground">
                      +{permissionRequests.length - previewIcons.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
          </CollapsibleContent>
        </Collapsible>
        <TooltipContent side="bottom">{tooltipText}</TooltipContent>
      </Tooltip>

      <PopoverContent
        className="w-84 rounded-xl p-3"
        onMouseEnter={handlePopoverMouseEnter}
        onMouseLeave={handlePopoverMouseLeave}
      >
        <PopoverTitle>Permission Requests</PopoverTitle>
        <div className="scrollbar-subtle scrollbar-hover-only flex max-h-64 w-full flex-col divide-y divide-border-subtle overflow-y-auto px-1">
          {permissionRequests.length === 0 ? (
            <div className="flex items-center justify-center py-3">
              <span className="text-muted-foreground text-sm">
                No pending requests
              </span>
            </div>
          ) : (
            // Sort by timestamp descending (newest first)
            [...permissionRequests]
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((request) => (
                <PermissionRequestRow
                  key={request.id}
                  request={request}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onSelectDevice={handleSelectDevice}
                />
              ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
