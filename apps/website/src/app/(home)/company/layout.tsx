import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Company · stagewise',
  description:
    "We're building the software engineering environment of the future.",
  openGraph: {
    title: 'Company · stagewise',
    description:
      "We're building the software engineering environment of the future.",
    type: 'website',
  },
  twitter: {
    title: 'Company · stagewise',
    description:
      "We're building the software engineering environment of the future.",
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function TeamLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
