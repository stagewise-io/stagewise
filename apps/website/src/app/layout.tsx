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
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cg transform='translate(15%2C15) scale(0.7)'%3E%3Cpath fill='%232559fe' d='M50 0C77.6142 0 100 22.3858 100 50V90C100 95.5228 95.5228 100 90 100H50C22.3858 100 0 77.6142 0 50C0 22.3858 22.3858 0 50 0ZM50.1367 12C29.15 12.0002 12.1367 29.0133 12.1367 50C12.1367 70.9867 29.15 87.9998 50.1367 88C71.1235 88 88.1367 70.9868 88.1367 50C88.1367 29.0132 71.1235 12 50.1367 12Z'/%3E%3Ccircle fill='%232559fe' cx='50' cy='50' r='28'/%3E%3C/g%3E%3C/svg%3E",
        type: 'image/svg+xml',
      },
    ],
  },
  metadataBase: new URL('https://stagewise.io'),
  title: 'stagewise',
  description:
    'A purpose-built browser for web development. Build, preview, and iterate on your frontend with an AI agent built right in.',
  openGraph: {
    title: 'stagewise Â· The coding agent built for the web',
    description:
      'A purpose-built browser for web development. Build, preview, and iterate on your frontend with an AI agent built right in.',
    type: 'website',
    images: [
      {
        url: '/agent-thumbnail.png',
        width: 1200,
        height: 630,
        alt: 'stagewise: The coding agent built for the web',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stagewise Â· The coding agent built for the web',
    description:
      'A purpose-built browser for web development. Build, preview, and iterate on your frontend with an AI agent built right in.',
    images: ['/agent-thumbnail.png'],
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
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
