import { news } from '@/lib/source';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

export const metadata: Metadata = {
  title: 'Newsroom · stagewise',
  description:
    "Find out what we're up to, what we're thinking, and what we're doing at stagewise",
  openGraph: {
    title: 'Newsroom · stagewise',
    description:
      "Find out what we're up to, what we're thinking, and what we're doing at stagewise",
    type: 'website',
  },
  twitter: {
    title: 'Newsroom · stagewise',
    description:
      "Find out what we're up to, what we're thinking, and what we're doing at stagewise",
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function BlogPage() {
  const posts = news.getPages();

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4">
      <ScrollReveal>
        <div className="mb-12 flex flex-col items-start gap-4 text-left">
          <h1 className="font-medium text-3xl tracking-tight md:text-5xl">
            <span className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-black bg-clip-text text-transparent dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
              Newsroom
            </span>
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Find out what we're up to, what we're thinking, and what we're doing
            at stagewise.
          </p>
          <div className="flex flex-row gap-4">
            <Link
              href="https://www.ycombinator.com/companies/stagewise"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Y Combinator page of stagewise"
              className="flex size-6 items-center justify-center rounded-sm bg-[#F26625] text-sm text-white transition-opacity hover:opacity-80"
            >
              Y
            </Link>
            <Link
              href="https://www.linkedin.com/company/stagewise-io"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn page of stagewise"
              className="flex size-6 items-center justify-center rounded-sm bg-[#0b66c2] font-bold text-sm text-white transition-opacity hover:opacity-80"
            >
              in
            </Link>
            <Link
              href="https://x.com/stagewise_io"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X page of stagewise"
              className="flex size-6 items-center justify-center rounded-sm bg-black text-sm text-white transition-opacity hover:opacity-80 dark:bg-zinc-800"
            >
              𝕏
            </Link>
          </div>
        </div>
      </ScrollReveal>
      <div className="flex flex-col gap-6 md:ml-24">
        {posts
          .sort(
            (a, b) =>
              new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
          )
          .map((post, index) => (
            <ScrollReveal key={post.path} delay={200 + index * 100}>
              <Link href={post.url}>
                <div className="flex w-full flex-col items-start justify-center gap-1 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                  <p className="font-semibold text-xl text-zinc-900 tracking-tight dark:text-white">
                    {post.data.title}
                  </p>
                  <span className="text-base text-zinc-600 dark:text-zinc-400">
                    {post.data.description}
                  </span>
                  <div className="mt-1 flex w-full flex-row items-end justify-end gap-6">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {post.data.date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </Link>
            </ScrollReveal>
          ))}
      </div>
    </div>
  );
}
