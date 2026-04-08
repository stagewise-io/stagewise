import { getLegalPage } from '@/lib/source';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';

export default async function TermsPage() {
  const page = getLegalPage('terms');
  if (!page) notFound();

  return (
    <div className="prose dark:prose-invert mx-auto w-full max-w-7xl px-4">
      <MDXRemote source={page.source} />
    </div>
  );
}
