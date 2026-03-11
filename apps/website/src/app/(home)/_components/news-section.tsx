'use client';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import Link from 'next/link';

interface NewsPost {
  title: string;
  url: string;
  date: string; // ISO string â safe to pass as prop across server/client boundary
}

export function NewsSection({ posts }: { posts: NewsPost[] }) {
  return (
    <section className="relative z-10 w-full py-40 md:py-48">
      <ScrollReveal>
        <h2 className="mb-10 font-medium text-2xl tracking-tight md:text-3xl">
          From the news room
        </h2>
      </ScrollReveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
        {posts.map((post, index) => (
          <ScrollReveal key={post.url} delay={index * 100}>
            <Link
              href={post.url}
              className="flex min-h-[180px] flex-col gap-4 rounded-lg bg-surface-1 p-6 transition-colors hover:bg-hover-derived"
            >
              <time className="font-light text-muted-foreground text-sm">
                {new Date(post.date).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
              <p className="font-medium text-foreground text-lg leading-tight">
                {post.title}
              </p>
            </Link>
          </ScrollReveal>
        ))}
      </div>

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
