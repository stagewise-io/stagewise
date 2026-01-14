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
      <PreviewCardBase.Backdrop
        className="pointer-events-auto fixed inset-0 z-40 h-screen w-screen"
        onClick={(e) => e.stopPropagation()}
      />
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
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex max-w-80 flex-col gap-4 p-3',
            'rounded-lg border border-border-subtle bg-background',
            'text-foreground shadow-lg',
            'transition-[transform,scale,opacity] duration-150 ease-out',
            'origin-(--transform-origin)',
            'data-ending-style:scale-90 data-starting-style:scale-90',
            'data-ending-style:opacity-0 data-starting-style:opacity-0',
            className,
          )}
        >
          {children}
        </PreviewCardBase.Popup>
      </PreviewCardBase.Positioner>
    </PreviewCardBase.Portal>
  );
};
