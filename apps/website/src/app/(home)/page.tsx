import type { Metadata } from 'next';
import { getAllNewsPosts } from '@/lib/source';
import { HomeClient } from './_components/home-client';

export const metadata: Metadata = {
  title: 'The Open Source Agentic IDE · stagewise',
  description:
    'Create and orchestrate coding agents, show app previews and run git workflows. Use your favorite models across all providers.',
  openGraph: {
    title: 'The Open Source Agentic IDE · stagewise',
    description:
      'Create and orchestrate coding agents, show app previews and run git workflows. Use your favorite models across all providers.',
    type: 'website',
  },
  twitter: {
    title: 'The Open Source Agentic IDE · stagewise',
    description:
      'Create and orchestrate coding agents, show app previews and run git workflows. Use your favorite models across all providers.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function Home() {
  const posts = getAllNewsPosts()
    .slice(0, 6)
    .map((p) => ({
      title: p.title,
      url: p.url,
      date: p.date.toISOString(),
      type: p.type,
    }));

  return (
    <div className="relative mx-auto mt-12 min-h-screen w-full max-w-7xl px-4">
      <HomeClient newsPosts={posts} />
    </div>
  );
}
