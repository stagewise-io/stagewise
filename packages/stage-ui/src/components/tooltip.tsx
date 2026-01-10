import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

export const TooltipProvider = BaseTooltip.Provider;

export const Tooltip = ({
  children,
}: {
  children: ReactElement | ReactNode | ReactNode[];
}) => {
  return <BaseTooltip.Root>{children}</BaseTooltip.Root>;
};

type TooltipTriggerProps = ComponentProps<typeof BaseTooltip.Trigger> & {
  children?: ReactElement;
};

export const TooltipTrigger = ({
  children,
  delay = 100,
  ...props
}: TooltipTriggerProps) => {
  return (
    <BaseTooltip.Trigger
      render={
        props.render ||
        (children as ReactElement<Record<string, unknown>, string>)
      }
      delay={delay}
      {...props}
    />
  );
};

export const TooltipContent = ({
  children,
  side = 'top',
}: {
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) => {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner
        sideOffset={2}
        alignOffset={2}
        side={side}
        className="z-50"
      >
        <BaseTooltip.Popup className="rounded-lg bg-background px-1.5 py-0.5 text-foreground text-xs shadow-md ring-1 ring-border-subtle">
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
};
