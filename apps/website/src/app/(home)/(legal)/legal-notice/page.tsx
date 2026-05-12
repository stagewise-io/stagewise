import type { Metadata } from 'next';
import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';

export const metadata: Metadata = {
  title: 'Legal Notice · stagewise',
  description:
    'Read the legal notice for stagewise, including company information and legal disclosures.',
  openGraph: {
    title: 'Legal Notice · stagewise',
    description:
      'Read the legal notice for stagewise, including company information and legal disclosures.',
    type: 'website',
  },
  twitter: {
    title: 'Legal Notice · stagewise',
    description:
      'Read the legal notice for stagewise, including company information and legal disclosures.',
    creator: '@stagewise_io',
  },
  category: 'legal',
};

export default async function LegalNoticePage() {
  const page = getLegalPage('legal-notice');
  if (!page) notFound();

  const { content } = await compileMDX({
    source: page.source,
    options: { development: true } as never,
  });

  return (
    <div className="prose dark:prose-invert mx-auto w-full max-w-7xl px-4">
      {content}
    </div>
  );
}
