import { cn } from '@/utils';
import type { ReactNode } from 'react';
import { Glassy } from './glassy.js';

function Panel({
  children,
  alwaysFullHeight = false,
  className,
}: {
  children?: ReactNode;
  alwaysFullHeight?: boolean;
  className?: string;
}) {
  return (
    <Glassy
      as="section"
      className={cn(
        'pointer-events-auto flex max-h-full min-h-48 flex-col items-stretch justify-start rounded-3xl',
        alwaysFullHeight && 'h-full',
        className,
      )}
    >
      {children}
    </Glassy>
  );
}

function PanelHeader({
  title,
  description,
  iconArea,
  actionArea,
  className,
}: {
  title?: string | ReactNode;
  description?: string | ReactNode;
  iconArea?: ReactNode;
  actionArea?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex w-auto flex-row items-center justify-between gap-2 rounded-t-[inherit] border-zinc-500/15 border-b bg-gradient-to-b from-transparent via-transparent to-white/5 pt-3 pr-3 pb-2 pl-4 text-foreground',
        className,
      )}
    >
      {iconArea}
      <div className="flex flex-1 flex-col">
        {title && <h3 className="font-medium text-lg">{title}</h3>}
        {description && (
          <p className="font-medium text-foreground/70">{description}</p>
        )}
        {}
      </div>
      {actionArea}
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-px w-full bg-gradient-to-r from-white/10 via-white/30 to-white/10" />
    </header>
  );
}

export interface PanelContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function PanelContent({ children, className, ...props }: PanelContentProps) {
  return (
    <div
      {...props}
      className={cn(
        'flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 text-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelFooter({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        'flex flex-row items-end justify-end gap-2 rounded-b-[inherit] border-zinc-500/15 border-t bg-white/5 pt-2 pr-3 pb-3 pl-4 text-foreground/80 text-sm',
        className,
      )}
    >
      <div className="absolute top-0 right-0 left-0 h-px w-full bg-gradient-to-r from-zinc-100/10 via-zinc-100/30 to-zinc-100/10" />
      {children}
    </footer>
  );
}

export { Panel, PanelHeader, PanelContent, PanelFooter };
