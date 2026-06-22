import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { getAllJobParams, getJob } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';

export default async function JobDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const job = getJob(slug);
  if (!job) notFound();

  const { content } = await compileMDX({
    source: job.source,
    options: {
      mdxOptions: { development: process.env.NODE_ENV !== 'production' },
    },
    components: getMDXComponents(),
  });

  return (
    <div className="mx-auto mt-12 w-full max-w-3xl px-4">
      <ScrollReveal>
        <Link
          href="/careers"
          className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
        >
          <svg
            className="size-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
          All positions
        </Link>
      </ScrollReveal>

      <ScrollReveal delay={50}>
        <div className="mt-8 flex flex-col items-start gap-4 text-left">
          <h1 className="font-medium text-3xl text-foreground tracking-tight md:text-5xl">
            {job.title}
          </h1>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-derived-subtle bg-surface-tinted px-3 py-1 font-medium text-[11px] text-primary-foreground">
              {job.section}
            </span>
            <span className="inline-flex items-center rounded-full border border-derived-subtle bg-surface-tinted px-3 py-1 font-medium text-[11px] text-primary-foreground">
              {job.type}
            </span>
            <span className="inline-flex items-center rounded-full border border-derived-subtle bg-surface-tinted px-3 py-1 font-medium text-[11px] text-primary-foreground">
              {job.location}
            </span>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <div className="news-prose prose prose-zinc dark:prose-invert mt-12 max-w-none">
          {content}
        </div>
      </ScrollReveal>
    </div>
  );
}

export async function generateStaticParams() {
  return getAllJobParams().map(({ slug }) => ({ slug: slug[0] }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const job = getJob(slug);
  if (!job) notFound();

  const description = `${job.title} — ${job.type}, ${job.location}. Join stagewise and help build the future of AI-driven development.`;

  return {
    title: `${job.title} · stagewise Careers`,
    description,
    openGraph: {
      title: `${job.title} · stagewise Careers`,
      description,
      locale: 'en_US',
    },
    twitter: {
      title: `${job.title} · stagewise Careers`,
      description,
      creator: '@stagewise_io',
    },
    category: 'Jobs',
    applicationName: 'stagewise',
    publisher: 'stagewise',
  };
}
