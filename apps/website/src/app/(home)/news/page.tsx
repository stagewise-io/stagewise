import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { NewsGrid } from '../_components/news-section';
import { getNewsTypeLabel, newsTypes, type NewsType } from '@/lib/news';
import { getAllNewsPosts } from '@/lib/source';
import type { Metadata } from 'next';
import Link from 'next/link';

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

const filterOptions: Array<{ value: 'all' | NewsType; label: string }> = [
  { value: 'all', label: 'All' },
  ...newsTypes.map((value) => ({ value, label: getNewsTypeLabel(value) })),
];

export default async function BlogPage(props: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await props.searchParams;
  const selectedType =
    typeof type === 'string' && newsTypes.includes(type as NewsType)
      ? (type as NewsType)
      : 'all';

  const posts = getAllNewsPosts().filter(
    (post) => selectedType === 'all' || post.type === selectedType,
  );

  return (
    <div className="relative mx-auto w-full max-w-7xl px-4">
      <ScrollReveal>
        <div className="mb-12 flex flex-col items-start gap-4 text-left">
          <h1 className="font-medium text-3xl tracking-tight md:text-5xl">
            <span className="text-foreground">Newsroom</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Find out what we're up to, what we're thinking, and what we're doing
            at stagewise.
          </p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={100}>
        <div className="mb-8 flex w-full flex-wrap items-center justify-between gap-4">
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
              className="flex size-6 items-center justify-center rounded-sm bg-black text-sm text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black"
            >
              𝕏
            </Link>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const isActive = option.value === selectedType;
              return (
                <Link
                  key={option.value}
                  href={
                    option.value === 'all'
                      ? '/news'
                      : `/news?type=${option.value}`
                  }
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? 'inline-flex items-center rounded-full border border-derived bg-primary-solid px-3 py-1.5 font-medium text-sm text-solid-foreground'
                      : 'inline-flex items-center rounded-full border border-derived-subtle bg-surface-1 px-3 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:bg-hover-derived hover:text-foreground'
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      </ScrollReveal>
      <NewsGrid
        revealDelay={200}
        posts={posts.map((post) => ({
          title: post.title,
          url: post.url,
          date: post.date.toISOString(),
          type: post.type,
          description: post.description,
        }))}
      />
    </div>
  );
}
