import type { ReactNode } from 'react';

export function ToolbarSection({ children }: { children?: ReactNode }) {
  return (
    <div className="fade-in slide-in-from-right-2 flex max-h-sm max-w-full animate-in snap-start flex-col items-center justify-between gap-1 py-0.5">
      {children}
    </div>
  );
}
