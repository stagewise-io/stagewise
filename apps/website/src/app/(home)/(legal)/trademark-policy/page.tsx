import type { Metadata } from 'next';
import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';

export const metadata: Metadata = {
  title: 'Trademark Policy · stagewise',
  description:
    'Read the stagewise Trademark Policy for guidance on using the stagewise name, brand, and assets.',
  openGraph: {
    title: 'Trademark Policy · stagewise',
    description:
      'Read the stagewise Trademark Policy for guidance on using the stagewise name, brand, and assets.',
    type: 'website',
  },
  twitter: {
    title: 'Trademark Policy · stagewise',
    description:
      'Read the stagewise Trademark Policy for guidance on using the stagewise name, brand, and assets.',
    creator: '@stagewise_io',
  },
  category: 'legal',
};

export default async function TrademarkPolicyPage() {
  const page = getLegalPage('trademark-policy');
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
