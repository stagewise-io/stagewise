import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Download stagewise · The Open Source Agentic IDE',
  description: 'Download stagewise for macOS, Windows, and Linux.',
  openGraph: {
    title: 'Download stagewise · The Open Source Agentic IDE',
    description: 'Download stagewise for macOS, Windows, and Linux.',
    type: 'website',
  },
  twitter: {
    title: 'Download stagewise · The Open Source Agentic IDE',
    description: 'Download stagewise for macOS, Windows, and Linux.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function DownloadLayout({ children }: { children: ReactNode }) {
  return children;
}
