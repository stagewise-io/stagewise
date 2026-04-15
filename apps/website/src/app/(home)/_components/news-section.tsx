'use client';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { getNewsTypeBadgeLabel, type NewsType } from '@/lib/news';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import Link from 'next/link';

interface NewsPost {
  title: string;
  url: string;
  date: string; // ISO string â safe to pass as prop across server/client boundary
  type: NewsType;
  description?: string;
}

export function NewsGrid({
  posts,
  revealDelay = 0,
}: {
  posts: NewsPost[];
  revealDelay?: number;
}) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
      {posts.map((post, index) => (
        <ScrollReveal key={post.url} delay={revealDelay + index * 100}>
          <Link
            href={post.url}
            className="flex h-full min-h-[180px] flex-col gap-4 rounded-lg bg-surface-1 p-6 transition-colors hover:bg-hover-derived"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full border border-derived-subtle bg-surface-tinted px-2 py-1 font-medium text-[11px] text-primary-foreground">
                {getNewsTypeBadgeLabel(post.type)}
              </span>
              <time className="font-light text-muted-foreground text-sm">
                {new Date(post.date).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
            </div>
            <p className="font-medium text-lg leading-tight">{post.title}</p>
            {post.description ? (
              <span className="text-base text-muted-foreground">
                {post.description}
              </span>
            ) : null}
          </Link>
        </ScrollReveal>
      ))}
    </div>
  );
}

export function NewsSection({ posts }: { posts: NewsPost[] }) {
  return (
    <section className="relative z-10 w-full py-40 md:py-48">
      <ScrollReveal>
        <h2 className="mb-10 font-medium text-2xl tracking-tight md:text-3xl">
          From the news room
        </h2>
      </ScrollReveal>

      <NewsGrid posts={posts} />

      <div className="flex justify-end">
        <ScrollReveal delay={400}>
          <Link
            href="/news"
            className="mt-10 inline-flex items-center gap-2 text-primary-foreground hover:text-hover-derived active:text-active-derived"
          >
            See more news
            <IconArrowRightFill18 className="inline size-4" />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
