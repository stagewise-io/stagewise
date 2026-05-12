import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Our Mission · stagewise',
  description:
    "We're building the software engineering environment of the future.",
  openGraph: {
    title: 'Our Mission · stagewise',
    description:
      "We're building the software engineering environment of the future.",
    type: 'website',
  },
  twitter: {
    title: 'Our Mission · stagewise',
    description:
      "We're building the software engineering environment of the future.",
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function TeamLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center bg-background pt-24 pb-32">
      {children}
    </main>
  );
}
