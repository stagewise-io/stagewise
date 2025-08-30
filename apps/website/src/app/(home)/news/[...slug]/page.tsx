import { news, source } from '@/lib/source';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// Sanitize slug to prevent path traversal attacks
function _sanitizeSlug(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return 'index';

  // Join the slug parts and normalize
  const slugPath = slug.join('/');

  // Remove any path traversal attempts and restrict to safe characters
  const sanitized = slugPath
    .replace(/\.\./g, '') // Remove .. sequences
    .replace(/[^a-zA-Z0-9\-_/]/g, '') // Only allow alphanumeric, hyphens, underscores, and forward slashes
    .replace(/\/+/g, '/') // Collapse multiple slashes
    .replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes

  return sanitized || 'index';
}

export default async function PostPage(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const post = news.getPage(params.slug);
  if (!post) notFound();

  const { title, description, body: MDXContent, date } = post.data;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-12 p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-base text-zinc-600 dark:text-zinc-400">
          {date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <h1 className="bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text font-bold text-3xl text-transparent tracking-tight md:text-5xl dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
          {title}
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
        <div className="flex flex-row gap-4">
          <Link
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
              `https://stagewise.io${post.url}`,
            )}`}
            target="_blank"
            aria-label="Share this post on LinkedIn"
            className="glass-body glass-body-motion glass-body-interactive glass-body-motion-interactive flex h-8 items-center justify-center rounded-sm bg-[#0b66c2] px-4 text-sm text-white"
          >
            Share on <span className="ml-2 font-bold">in</span>
          </Link>
          <Link
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(
              `Check out the news from @stagewise_io: ${title}`,
            )}&url=${encodeURIComponent(`https://stagewise.io${post.url}`)}`}
            target="_blank"
            aria-label="Share this post on X"
            className="glass-body glass-body-motion glass-body-interactive glass-body-motion-interactive flex h-8 items-center justify-center rounded-sm bg-black px-4 text-sm text-white dark:bg-zinc-800"
          >
            Share on <span className="ml-2 font-bold">𝕏</span>
          </Link>
        </div>
      </div>
      <div className="prose dark:prose-invert prose-zinc">
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, post),
          })}
        />
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return news.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = news.getPage(params.slug);
  if (!page) notFound();

  const metadata: Metadata = {
    title: `${page.data.title} | stagewise Newsroom`,
    description: page.data.description,
    openGraph: {
      title: `${page.data.title} | stagewise Newsroom`,
      description: page.data.description,
      locale: 'en_US',
      images: page.data.ogImage ? [page.data.ogImage] : undefined,
    },
    twitter: {
      title: `${page.data.title} | stagewise Newsroom`,
      description: page.data.description,
      creator: '@stagewise_io',
    },
    category: 'News',
    applicationName: 'stagewise',
    publisher: 'stagewise',
  };

  return metadata;
}
