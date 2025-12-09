import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

export const TooltipProvider = BaseTooltip.Provider;

export const Tooltip = ({
  children,
}: {
  children: ReactElement | ReactNode | ReactNode[];
}) => {
  return <BaseTooltip.Root delay={200}>{children}</BaseTooltip.Root>;
};

type TooltipTriggerProps = ComponentProps<typeof BaseTooltip.Trigger> & {
  children?: ReactElement;
};

export const TooltipTrigger = ({ children, ...props }: TooltipTriggerProps) => {
  return (
    <BaseTooltip.Trigger
      render={
        props.render ||
        (children as ReactElement<Record<string, unknown>, string>)
      }
      {...props}
    />
  );
};

export const TooltipContent = ({ children }: { children: React.ReactNode }) => {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={2} alignOffset={2} className="z-50">
        <BaseTooltip.Popup className="glass-body rounded-lg px-1.5 py-0.5 text-foreground text-xs backdrop-blur-sm">
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
};
