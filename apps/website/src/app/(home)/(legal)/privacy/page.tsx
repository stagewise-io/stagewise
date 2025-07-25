import { legal } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import { notFound } from 'next/navigation';

export default async function PrivacyPolicyPage() {
  const page = legal.getPage(['privacy']);
  if (!page) notFound();

  const MDXContent = page.data.body;

  return (
    <main className="prose mx-auto min-h-screen max-w-5xl bg-muted p-4 md:p-10">
      <MDXContent components={getMDXComponents({})} />
    </main>
  );
}
