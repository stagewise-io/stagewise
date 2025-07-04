import { cn } from '@/utils';
import type { ReactNode } from 'react';

function Panel({
  children,
  alwaysFullHeight = false,
}: {
  children?: ReactNode;
  alwaysFullHeight?: boolean;
}) {
  console.log('Hello from Panel!');
  return (
    <section
      className={cn(
        'flex max-h-full min-h-48 flex-col items-stretch justify-start rounded-2xl border border-border/30 bg-zinc-50/80 p-4 shadow-md backdrop-blur-md',
        alwaysFullHeight && 'h-full',
      )}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <header className="mb-3 flex flex-col gap-1 text-zinc-950">
      {title && <h3 className="font-semibold text-lg ">{title}</h3>}
      {description && (
        <p className="font-medium text-zinc-600">{description}</p>
      )}
    </header>
  );
}

function PanelContent({ children }: { children?: ReactNode }) {
  return (
    <div className="-mx-4 flex flex-col gap-2 overflow-y-auto border-border/30 border-t px-4 pt-4 text-zinc-950">
      {children}
    </div>
  );
}

function PanelFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="flex flex-row items-end justify-end gap-2 text-sm text-zinc-600">
      {children}
    </footer>
  );
}

export { Panel, PanelHeader, PanelContent, PanelFooter };
