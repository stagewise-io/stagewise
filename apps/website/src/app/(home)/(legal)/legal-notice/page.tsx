import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';

export default async function LegalNoticePage() {
  const page = getLegalPage('legal-notice');
  if (!page) notFound();

  return (
    <div className="prose mx-auto w-full max-w-7xl px-4">
      <MDXRemote source={page.source} />
    </div>
  );
}
