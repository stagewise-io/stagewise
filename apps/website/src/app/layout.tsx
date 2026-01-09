import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { PostHogProvider } from '@/components/posthog-provider';
import { CookieBanner } from '@/components/cookie-banner';
import { SystemThemeProvider } from '@/components/theme-switcher';

export const metadata: Metadata = {
  metadataBase: new URL('https://stagewise.io'),
  title: 'stagewise',
  description:
    'A purpose-built browser for web development. Build, preview, and iterate on your frontend with an AI agent built right in.',
  openGraph: {
    title: 'stagewise · The browser for web developers',
    description:
      'A purpose-built browser for web development. Build, preview, and iterate on your frontend with an AI agent built right in.',
    type: 'website',
    images: [
      {
        url: '/agent-thumbnail.png',
        width: 1200,
        height: 630,
        alt: 'stagewise: The browser for web developers',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stagewise · The browser for web developers',
    description:
      'A purpose-built browser for web development. Build, preview, and iterate on your frontend with an AI agent built right in.',
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="relative flex min-h-screen flex-col">
        <div className="root">
          <PostHogProvider>
            <SystemThemeProvider>
              <RootProvider>{children}</RootProvider>
            </SystemThemeProvider>
          </PostHogProvider>
          <CookieBanner />
        </div>
      </body>
    </html>
  );
}
