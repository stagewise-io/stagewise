import { PreviewCard as PreviewCardBase } from '@base-ui/react/preview-card';
import { cn } from '../lib/utils';
import type { ReactElement } from 'react';

export const PreviewCard = PreviewCardBase.Root;

export type PreviewCardTriggerProps = Omit<
  React.ComponentProps<typeof PreviewCardBase.Trigger>,
  'render'
> & { children: ReactElement };
export const PreviewCardTrigger = ({
  children,
  ...props
}: PreviewCardTriggerProps) => {
  return (
    <PreviewCardBase.Trigger
      {...props}
      render={children as unknown as () => ReactElement}
    />
  );
};

export type PreviewCardContentProps = React.ComponentProps<
  typeof PreviewCardBase.Popup
> &
  React.ComponentProps<typeof PreviewCardBase.Positioner>;

export const PreviewCardContent = ({
  children,
  className,
  side,
  sideOffset,
  align,
  alignOffset,
  sticky,
  ...props
}: PreviewCardContentProps) => {
  return (
    <PreviewCardBase.Portal>
      <PreviewCardBase.Backdrop className="fixed inset-0 z-40 h-screen w-screen" />
      <PreviewCardBase.Positioner
        sideOffset={sideOffset ?? 4}
        side={side}
        align={align}
        alignOffset={alignOffset}
        sticky={sticky}
        className="z-50"
      >
        <PreviewCardBase.Popup
          {...props}
          className={cn(
            'flex max-w-80 flex-col gap-4 rounded-xl bg-background/80 p-3 text-foreground shadow-xl ring-1 ring-muted-foreground/30 backdrop-blur-sm transition-all duration-150 ease-out data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left data-[side=top]:origin-bottom data-[ending-style]:scale-75 data-[starting-style]:scale-75 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:blur-sm data-[starting-style]:blur-sm',
            className,
          )}
        >
          {children}
        </PreviewCardBase.Popup>
      </PreviewCardBase.Positioner>
    </PreviewCardBase.Portal>
  );
};
