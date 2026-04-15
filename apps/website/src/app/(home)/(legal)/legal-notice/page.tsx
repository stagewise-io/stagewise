import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';

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
