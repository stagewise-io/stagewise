import type { DeviceEmulation, TabState } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { Select } from '@stagewise/stage-ui/components/select';
import { IconReuseOutline18 } from '@stagewise/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { XIcon } from 'lucide-react';
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEVICE_PRESETS, getPresetConfig } from './device-emulation-presets';

const MIN_VIEWPORT_WIDTH = 240;
const MIN_VIEWPORT_HEIGHT = 160;
const CANVAS_PADDING = 32;
const DEVICE_PRESET_ITEMS = DEVICE_PRESETS.map((preset) => ({
  value: preset.presetId,
  label: preset.label,
  description: `${preset.width} × ${preset.height}`,
}));

const RESIZE_HANDLES = [
  ['left', 'top-0 -left-4 h-full w-4 cursor-ew-resize', 'h-10 w-0.5'],
  ['right', 'top-0 -right-4 h-full w-4 cursor-ew-resize', 'h-10 w-0.5'],
  ['bottom', '-bottom-4 left-0 h-4 w-full cursor-ns-resize', 'h-0.5 w-10'],
  [
    'bottom-left',
    '-bottom-4 -left-4 size-4 cursor-nesw-resize',
    'size-2 rounded-sm',
  ],
  [
    'bottom-right',
    '-right-4 -bottom-4 size-4 cursor-nwse-resize',
    'size-2 rounded-sm',
  ],
] as const;
type ResizeEdge = (typeof RESIZE_HANDLES)[number][0];

type DeviceEmulationFrameProps = {
  tab: TabState;
  containerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function DeviceEmulationFrame({
  tab,
  containerRef,
  children,
}: DeviceEmulationFrameProps) {
  const emulation = tab.deviceEmulation;

  if (!emulation || tab.devTools.chromeOpen) {
    return (
      <div
        ref={containerRef}
        id={`dev-app-preview-container-${tab.id}`}
        className="relative flex size-full flex-col items-center justify-center overflow-hidden rounded-lg"
      >
        {children}
      </div>
    );
  }

  return (
    <EnabledDeviceEmulationFrame
      tab={tab}
      emulation={emulation}
      containerRef={containerRef}
    >
      {children}
    </EnabledDeviceEmulationFrame>
  );
}

function EnabledDeviceEmulationFrame({
  tab,
  emulation: initialEmulation,
  containerRef,
  children,
}: DeviceEmulationFrameProps & { emulation: DeviceEmulation }) {
  const setDeviceEmulation = useKartonProcedure(
    (procedures) => procedures.browser.setDeviceEmulation,
  );
  const uiZoomPercentage = useKartonState(
    (state) => state.preferences.general.uiZoomPercentage,
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    scale: number;
  } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragSizeRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [emulation, setEmulation] = useState(initialEmulation);
  const viewportSize = {
    width: emulation.width,
    height: emulation.height,
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      setCanvasSize({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const fitScale =
    canvasSize.width && canvasSize.height
      ? Math.max(
          0.1,
          Math.min(
            1,
            (canvasSize.width - CANVAS_PADDING) / viewportSize.width,
            (canvasSize.height - CANVAS_PADDING) / viewportSize.height,
          ),
        )
      : 1;
  const appliedScale = fitScale * (uiZoomPercentage / 100);

  useEffect(() => {
    setDeviceEmulation.fire(
      {
        ...emulation,
        scale: appliedScale,
        fitScale,
      },
      tab.id,
      dragRef.current !== null,
    );
  }, [emulation, appliedScale, fitScale, setDeviceEmulation, tab.id]);

  useEffect(
    () => () => {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    },
    [],
  );

  const canResize = emulation.presetId === 'responsive';
  const frameWidth = Math.round(viewportSize.width * fitScale);
  const frameHeight = Math.round(viewportSize.height * fitScale);

  const updateEmulation = (updates: Partial<DeviceEmulation>) => {
    setEmulation((current) => ({
      ...current,
      ...updates,
    }));
  };

  const handlePresetChange = (presetId: string) => {
    const preset = DEVICE_PRESETS.find((item) => item.presetId === presetId);
    if (!preset) return;
    updateEmulation(getPresetConfig(preset));
  };

  const updateDimension = (dimension: 'width' | 'height', value: string) => {
    const number = Number(value);
    if (!number) return;
    const min =
      dimension === 'width' ? MIN_VIEWPORT_WIDTH : MIN_VIEWPORT_HEIGHT;
    updateEmulation({
      presetId: 'responsive',
      deviceScaleFactor: 1,
      mobile: false,
      [dimension]: Math.max(number, min),
    });
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    edge: ResizeEdge,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: viewportSize.width,
      startHeight: viewportSize.height,
      scale: fitScale,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaX = (event.clientX - drag.startX) / drag.scale;
    const deltaY = (event.clientY - drag.startY) / drag.scale;
    let width = drag.startWidth;
    let height = drag.startHeight;

    if (drag.edge.includes('left')) width -= deltaX * 2;
    if (drag.edge.includes('right')) width += deltaX * 2;
    if (drag.edge.includes('bottom')) height += deltaY;

    pendingDragSizeRef.current = {
      width: Math.max(Math.round(width), MIN_VIEWPORT_WIDTH),
      height: Math.max(Math.round(height), MIN_VIEWPORT_HEIGHT),
    };
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const size = pendingDragSizeRef.current;
      pendingDragSizeRef.current = null;
      if (size) setEmulation((current) => ({ ...current, ...size }));
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const finalSize = pendingDragSizeRef.current;
    pendingDragSizeRef.current = null;
    dragRef.current = null;
    setEmulation((current) =>
      finalSize ? { ...current, ...finalSize } : { ...current },
    );
  };

  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden">
      <div className="relative z-40 flex h-9 shrink-0 items-center gap-2 border-derived border-b bg-background pr-1 pl-2">
        <Select
          items={DEVICE_PRESET_ITEMS}
          value={emulation.presetId}
          onValueChange={(value) => handlePresetChange(value)}
          renderValue={(presetId) => (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-muted-foreground">
                Dimensions:
              </span>
              <span className="truncate text-foreground">
                {
                  DEVICE_PRESET_ITEMS.find((item) => item.value === presetId)
                    ?.label
                }
              </span>
            </span>
          )}
          size="sm"
          triggerVariant="ghost"
          triggerClassName="w-56 justify-between"
        />
        <div className="flex items-center gap-1">
          <Input
            type="number"
            aria-label="Viewport width"
            value={viewportSize.width}
            debounce={250}
            onValueChange={(value) => updateDimension('width', value)}
            size="xs"
            className="w-16 px-1 text-center text-sm tabular-nums"
          />
          <span className="text-muted-foreground text-sm">×</span>
          <Input
            type="number"
            aria-label="Viewport height"
            value={viewportSize.height}
            debounce={250}
            onValueChange={(value) => updateDimension('height', value)}
            size="xs"
            className="w-16 px-1 text-center text-sm tabular-nums"
          />
        </div>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Rotate viewport"
              onClick={() =>
                updateEmulation({
                  width: viewportSize.height,
                  height: viewportSize.width,
                })
              }
            >
              <IconReuseOutline18 className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rotate viewport</TooltipContent>
        </Tooltip>
        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Hide device toolbar"
                onClick={() => setDeviceEmulation(null, tab.id)}
              >
                <XIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide device toolbar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden p-4"
      >
        <div
          className="relative shrink-0 shadow-[0_0_0_100vmax_var(--color-surface-2)] ring-1 ring-border"
          style={{ width: frameWidth, height: frameHeight }}
        >
          <div
            ref={containerRef}
            id={`dev-app-preview-container-${tab.id}`}
            className="absolute inset-0 overflow-hidden"
          >
            {children}
          </div>

          {canResize
            ? RESIZE_HANDLES.map(([edge, className, indicatorClassName]) => (
                <div
                  key={edge}
                  aria-hidden="true"
                  onPointerDown={(event) => handlePointerDown(event, edge)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`group absolute z-50 flex touch-none items-center justify-center text-muted-foreground ${className}`}
                >
                  <span
                    className={`rounded-full bg-muted-foreground/60 transition-colors group-hover:bg-foreground ${indicatorClassName}`}
                  />
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
