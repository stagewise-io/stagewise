import './global.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { PostHogProvider } from '@/components/posthog-provider';
import { CookieBanner } from '@/components/cookie-banner';
import { SystemThemeProvider } from '@/components/theme-switcher';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'stagewise',
  url: 'https://stagewise.io',
  logo: 'https://stagewise.io/icon.png',
  description:
    'The Open Source Agentic IDE — a purpose-built browser for developers with a coding agent built right in.',
  foundingDate: '2024',
  founders: [
    { '@type': 'Person', name: 'Glenn Tows' },
    { '@type': 'Person', name: 'Lorenz Hutter' },
  ],
  sameAs: [
    'https://github.com/stagewise-io/stagewise',
    'https://x.com/stagewise_io',
    'https://www.linkedin.com/company/stagewise',
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'stagewise',
  url: 'https://stagewise.io',
  publisher: { '@type': 'Organization', name: 'stagewise' },
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://stagewise.io/?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
};

export const metadata: Metadata = {
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }],
  },
  metadataBase: new URL('https://stagewise.io'),
  title: 'stagewise · The Open Source Agentic IDE',
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
      className={`${GeistSans.className} scrollbar-subtle bg-background`}
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
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
