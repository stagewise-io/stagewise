import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { PostHogProvider } from '@/components/posthog-provider';
import { CookieBanner } from '@/components/cookie-banner';

export const metadata: Metadata = {
  metadataBase: new URL('https://stagewise.io'),
  title: 'stagewise | The frontend coding agent for production codebases',
  description:
    'Visually build your apps frontend right inside your browser on localhost. Compatible with any frontend framework.',
  openGraph: {
    title: 'stagewise | The frontend coding agent for production codebases',
    description:
      'Visually build your apps frontend right inside your browser on localhost. Compatible with any frontend framework.',
    type: 'website',
    images: [
      {
        url: '/agent-thumbnail.png',
        width: 1200,
        height: 630,
        alt: 'stagewise: The frontend coding agent for production codebases',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stagewise | The frontend coding agent for production codebases',
    description:
      'Visually build your apps frontend right inside your browser on localhost. Compatible with any frontend framework.',
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
        <PostHogProvider>
          <RootProvider>{children}</RootProvider>
        </PostHogProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
