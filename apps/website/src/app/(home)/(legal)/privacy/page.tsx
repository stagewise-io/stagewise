import type { Metadata } from 'next';
import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';

export const metadata: Metadata = {
  title: 'Privacy Policy · stagewise',
  description:
    'Read the stagewise Privacy Policy and learn how we collect, use, and protect your data.',
  openGraph: {
    title: 'Privacy Policy · stagewise',
    description:
      'Read the stagewise Privacy Policy and learn how we collect, use, and protect your data.',
    type: 'website',
  },
  twitter: {
    title: 'Privacy Policy · stagewise',
    description:
      'Read the stagewise Privacy Policy and learn how we collect, use, and protect your data.',
    creator: '@stagewise_io',
  },
  category: 'legal',
};

export default async function PrivacyPolicyPage() {
  const page = getLegalPage('privacy');
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
