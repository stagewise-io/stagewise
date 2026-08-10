import {
  type ReactZoomPanPinchProps,
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch';
import {
  type ComponentProps,
  type ReactNode,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { cn } from '@ui/utils';

type UseZoomableViewportOptions = {
  hotkeysEnabled?: boolean;
  onInteract?: () => void;
};

export function useZoomableViewport({
  hotkeysEnabled = false,
  onInteract,
}: UseZoomableViewportOptions = {}) {
  const ref = useRef<ReactZoomPanPinchRef>(null);
  const [scale, setScale] = useState(1);

  const handleInteract = useCallback(() => onInteract?.(), [onInteract]);

  const handleTransform = useCallback<
    NonNullable<ReactZoomPanPinchProps['onTransform']>
  >((_ref, state) => setScale(state.scale), []);

  const zoomIn = useCallback(() => {
    handleInteract();
    ref.current?.zoomIn(0.25, 150);
  }, [handleInteract]);

  const zoomOut = useCallback(() => {
    handleInteract();
    ref.current?.zoomOut(0.25, 150);
  }, [handleInteract]);

  const resetZoom = useCallback(() => {
    handleInteract();
    ref.current?.centerView(1, 150);
  }, [handleInteract]);

  const fit = useCallback((animationTime: number) => {
    const viewport = ref.current;
    const wrapper = viewport?.instance.wrapperComponent;
    const content = viewport?.instance.contentComponent;
    if (!viewport || !wrapper || !content) return;
    if (!wrapper.clientWidth || !wrapper.clientHeight) return;
    if (!content.offsetWidth || !content.offsetHeight) return;

    const scale = Math.max(
      Math.min(
        wrapper.clientWidth / content.offsetWidth,
        wrapper.clientHeight / content.offsetHeight,
        1,
      ),
      viewport.instance.setup.minScale,
    );
    viewport.centerView(scale, animationTime);
  }, []);

  const fitToView = useCallback(() => {
    handleInteract();
    fit(150);
  }, [fit, handleInteract]);

  useHotKeyListener(zoomIn, HotkeyActions.ZOOM_IN, hotkeysEnabled);
  useHotKeyListener(zoomOut, HotkeyActions.ZOOM_OUT, hotkeysEnabled);
  useHotKeyListener(resetZoom, HotkeyActions.ZOOM_RESET, hotkeysEnabled);

  return {
    ref,
    scale,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToView,
    fit,
    handleTransform,
    handleInteract,
  };
}

type ZoomableViewportController = ReturnType<typeof useZoomableViewport>;

type ZoomableViewportProps = {
  children: ReactNode;
  controller: ZoomableViewportController;
  className?: string;
  wrapperProps?: ComponentProps<'div'> & {
    [key: `data-${string}`]: string | undefined;
  };
};

const hasZoomModifier = (keys: string[]) =>
  keys.includes('Control') || keys.includes('Meta');

const hasNoShiftModifier = (keys: string[]) => !keys.includes('Shift');

export function ZoomableViewport({
  children,
  controller,
  className,
  wrapperProps,
}: ZoomableViewportProps) {
  useEffect(() => {
    const content = controller.ref.current?.instance.contentComponent;
    if (!content) return;

    const fit = () => controller.fit(0);
    const frame = requestAnimationFrame(fit);
    content.addEventListener('load', fit, true);

    return () => {
      cancelAnimationFrame(frame);
      content.removeEventListener('load', fit, true);
    };
  }, [controller.fit, controller.ref]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!event.shiftKey) return;

      const viewport = controller.ref.current;
      if (!viewport) return;

      event.preventDefault();
      event.stopPropagation();
      controller.handleInteract();

      const { positionX, positionY, scale } = viewport.state;
      viewport.setTransform(
        positionX - (event.deltaX || event.deltaY),
        positionY,
        scale,
        0,
      );
    },
    [controller.handleInteract, controller.ref],
  );

  return (
    <TransformWrapper
      ref={controller.ref}
      minScale={0.01}
      maxScale={100}
      limitToBounds={false}
      centerOnInit
      centerZoomedOut
      autoAlignment={{ disabled: true }}
      wheel={{
        step: 0.004,
        activationKeys: hasZoomModifier,
      }}
      trackPadPanning={{
        disabled: false,
        activationKeys: hasNoShiftModifier,
      }}
      panning={{
        velocityDisabled: true,
        allowMiddleClickPan: false,
        allowRightClickPan: false,
      }}
      doubleClick={{ mode: 'toggle', step: 0.75 }}
      onTransform={controller.handleTransform}
      onPanningStart={controller.handleInteract}
      onPinchStart={controller.handleInteract}
      onZoomStart={controller.handleInteract}
    >
      <TransformComponent
        wrapperClass={cn(
          'cursor-grab touch-none select-none active:cursor-grabbing',
          className,
        )}
        contentClass="will-change-transform"
        wrapperStyle={{ width: '100%', height: '100%' }}
        wrapperProps={{ ...wrapperProps, onWheel: handleWheel }}
      >
        {children}
      </TransformComponent>
    </TransformWrapper>
  );
}
