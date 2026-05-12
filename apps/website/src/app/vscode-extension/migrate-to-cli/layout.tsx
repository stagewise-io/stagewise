import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Upgrade to the new stagewise · stagewise',
  description:
    'Your stagewise setup needs an upgrade. Download the standalone stagewise IDE for a more powerful experience — no extension required.',
  openGraph: {
    title: 'Upgrade to the new stagewise · stagewise',
    description:
      'Your stagewise setup needs an upgrade. Download the standalone stagewise IDE for a more powerful experience — no extension required.',
    type: 'website',
  },
  twitter: {
    title: 'Upgrade to the new stagewise · stagewise',
    description:
      'Your stagewise setup needs an upgrade. Download the standalone stagewise IDE for a more powerful experience — no extension required.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function MigrateToCliLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
