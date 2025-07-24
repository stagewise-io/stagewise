import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';

export const metadata: Metadata = {
  metadataBase: new URL('https://stagewise.io'),
  title: 'stagewise | Visually prompt your dev agent - right on localhost.',
  description:
    'The stagewise coding agent lives inside your browser and lets you visually edit your frontend by selecting elements and prompting changes.',
  openGraph: {
    title: 'stagewise | Visually prompt your dev agent - right on localhost.',
    description:
      'The stagewise coding agent lives inside your browser and lets you visually edit your frontend by selecting elements and prompting changes.',
    type: 'website',
    images: [
      {
        url: '/agent-thumbnail.png',
        width: 1200,
        height: 630,
        alt: 'stagewise - Visually prompt your dev agent',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stagewise | Visually prompt your dev agent - right on localhost.',
    description:
      'The stagewise coding agent lives inside your browser and lets you visually edit your frontend by selecting elements and prompting changes.',
    images: ['/agent-thumbnail.png'],
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.className}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        {/* <PostHogProvider> */}
        {/* <StagewiseToolbar config={{ plugins: [] }} /> */}
        <RootProvider>{children}</RootProvider>
        {/* </PostHogProvider> */}
      </body>
    </html>
  );
}
