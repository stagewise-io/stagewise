import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Our Mission',
};

export default function TeamLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center bg-background pt-24 pb-32">
      {children}
    </main>
  );
}
