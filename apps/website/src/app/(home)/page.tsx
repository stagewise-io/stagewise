import type { Metadata } from 'next';
import { getAllNewsPosts } from '@/lib/source';
import { HomeClient } from './_components/home-client';

export const metadata: Metadata = {
  title: 'The Agentic IDE that runs on your stack · stagewise',
  description:
    'Create and orchestrate powerful AI coding agents. Use any model, including frontier, open-weight, and locally deployed ones.',
  openGraph: {
    title: 'The Agentic IDE that runs on your stack · stagewise',
    description:
      'stagewise is a next-gen agent orchestrator for software engineers, leveraging a frontier-grade agent harness. Full model sovereignty. Runs locally, connects to anything.',
    type: 'website',
  },
  twitter: {
    title: 'The Agentic IDE that runs on your stack · stagewise',
    description:
      'stagewise is a next-gen agent orchestrator for software engineers, leveraging a frontier-grade agent harness. Full model sovereignty. Runs locally, connects to anything.',
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
