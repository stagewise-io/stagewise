import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background pt-24 pb-32">
      {children}
    </div>
  );
}
