import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { StagewiseToolbar } from '@stagewise/toolbar-next';
import { PostHogProvider } from '@/components/posthog-provider';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'stagewise | Visually prompt your dev agent - right on localhost.',
  description:
    'Our toolbar connects your app frontend to your favorite code agent and lets you edit your web app UI with prompts.',
  openGraph: {
    title: 'stagewise | Visually prompt your dev agent - right on localhost.',
    description:
      'Our toolbar connects your app frontend to your favorite code agent and lets you edit your web app UI with prompts.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stagewise | Visually prompt your dev agent - right on localhost.',
    description:
      'Our toolbar connects your app frontend to your favorite code agent and lets you edit your web app UI with prompts.',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <PostHogProvider>
          <StagewiseToolbar config={{ plugins: [] }} />
          <RootProvider>{children}</RootProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
