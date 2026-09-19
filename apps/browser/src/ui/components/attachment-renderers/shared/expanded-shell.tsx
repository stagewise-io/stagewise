import type { ReactNode } from 'react';
import { cn } from '@ui/utils';

interface ExpandedShellProps {
  fileName: string;
  children: ReactNode;
  className?: string;
}

export function ExpandedShell({
  fileName,
  children,
  className,
}: ExpandedShellProps) {
  return (
    <span
      className={cn(
        'flex w-fit max-w-full shrink-0 flex-col overflow-hidden rounded-lg',
        'border border-border-subtle bg-surface-1',
        className,
      )}
    >
      <span className="flex min-h-24 items-center justify-center bg-background p-1.5">
        {children}
      </span>
      <span className="block border-border-subtle border-t px-2.5 py-1.5">
        <span className="max-w-48 truncate font-medium text-foreground text-xs">
          {fileName}
        </span>
      </span>
    </span>
  );
}
