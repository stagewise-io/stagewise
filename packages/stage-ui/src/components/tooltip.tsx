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
      <BaseTooltip.Positioner sideOffset={2} alignOffset={2}>
        <BaseTooltip.Popup className="rounded-lg border border-border/20 bg-gradient-to-b from-white/40 to-zinc-50/60 px-1.5 py-0.5 text-xs text-zinc-950/80 shadow-md backdrop-blur-sm">
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
};
