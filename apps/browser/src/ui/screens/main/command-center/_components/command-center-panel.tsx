import type { ReactNode } from 'react';

export function CommandCenterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-derived bg-background text-foreground shadow-elevation-2">
      {children}
    </div>
  );
}
