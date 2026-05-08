import './global.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { PostHogProvider } from '@/components/posthog-provider';
import { CookieBanner } from '@/components/cookie-banner';
import { SystemThemeProvider } from '@/components/theme-switcher';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }],
  },
  metadataBase: new URL('https://stagewise.io'),
  title: 'stagewise',
  description:
    'The Open Source Agentic IDE. stagewise is a purpose-built browser for developers with a coding agent built right in.',
  openGraph: {
    title: 'stagewise · The Open Source Agentic IDE',
    description:
      'The Open Source Agentic IDE. stagewise is a purpose-built browser for developers with a coding agent built right in.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stagewise · The Open Source Agentic IDE',
    description:
      'The Open Source Agentic IDE. stagewise is a purpose-built browser for developers with a coding agent built right in.',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.className} scrollbar-subtle bg-background`}
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
            <SystemThemeProvider>{children}</SystemThemeProvider>
          </PostHogProvider>
          <CookieBanner />
        </div>
      </body>
    </html>
  );
}
