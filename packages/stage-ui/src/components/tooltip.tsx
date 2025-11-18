import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

export const TooltipProvider = BaseTooltip.Provider;

export const Tooltip = ({
  children,
}: {
  children: ReactElement | ReactNode | ReactNode[];
}) => {
  return <BaseTooltip.Root delay={200}>{children}</BaseTooltip.Root>;
};

export const TooltipTrigger = ({ children }: { children: ReactElement }) => {
  return (
    <BaseTooltip.Trigger
      render={children as ReactElement<Record<string, unknown>, string>}
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
