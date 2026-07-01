import type { Metadata } from 'next';
import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';

export const metadata: Metadata = {
  title: 'Terms of Service · stagewise',
  description:
    'Read the stagewise Terms of Service for using the website, product, and related services.',
  openGraph: {
    title: 'Terms of Service · stagewise',
    description:
      'Read the stagewise Terms of Service for using the website, product, and related services.',
    type: 'website',
  },
  twitter: {
    title: 'Terms of Service · stagewise',
    description:
      'Read the stagewise Terms of Service for using the website, product, and related services.',
    creator: '@stagewise_io',
  },
  category: 'legal',
  alternates: {
    canonical: 'https://stagewise.io/terms',
  },
  robots: { index: true, follow: true },
};

export default async function TermsPage() {
  const page = getLegalPage('terms');
  if (!page) notFound();

  const { content } = await compileMDX({
    source: page.source,
    options: {
      mdxOptions: { development: process.env.NODE_ENV !== 'production' },
    },
  });

  return (
    <div className="prose dark:prose-invert mx-auto mt-12 w-full max-w-7xl px-4">
      {content}
    </div>
  );
}
