import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Meet the new stagewise · stagewise',
  description:
    'The stagewise extension is retired. Download the standalone stagewise IDE for a more powerful experience — no extension required.',
  openGraph: {
    title: 'Meet the new stagewise · stagewise',
    description:
      'The stagewise extension is retired. Download the standalone stagewise IDE for a more powerful experience — no extension required.',
    type: 'website',
  },
  twitter: {
    title: 'Meet the new stagewise · stagewise',
    description:
      'The stagewise extension is retired. Download the standalone stagewise IDE for a more powerful experience — no extension required.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return children;
}
