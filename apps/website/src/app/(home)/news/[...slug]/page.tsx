import { getAllNewsParams, getNewsPost } from '@/lib/source';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';

export default async function PostPage(props: {
  params: Promise<{ slug: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug?.join('/') ?? '';
  const post = getNewsPost(slug);
  if (!post) notFound();

  return (
    <div className="flex w-full max-w-6xl flex-col gap-12 p-4">
      <div className="flex flex-col items-start gap-4 text-left">
        <span className="text-base text-muted-foreground">
          {post.date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <h1 className="font-medium text-3xl text-foreground tracking-tight md:text-5xl">
          {post.title}
        </h1>
        <p className="text-lg text-muted-foreground">{post.description}</p>
        <div className="flex flex-row gap-4">
          <Link
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
              `https://stagewise.io${post.url}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this post on LinkedIn"
            className="flex h-8 items-center justify-center rounded-sm bg-[#0b66c2] px-4 text-sm text-white"
          >
            Share on <span className="ml-2 font-bold">in</span>
          </Link>
          <Link
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(
              `Check out the news from @stagewise_io: ${post.title}`,
            )}&url=${encodeURIComponent(`https://stagewise.io${post.url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this post on X"
            className="flex h-8 items-center justify-center rounded-sm bg-black px-4 text-sm text-white dark:bg-white dark:text-black"
          >
            Share on <span className="ml-2 font-bold">𝕏</span>
          </Link>
        </div>
      </div>
      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <MDXRemote source={post.source} />
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return getAllNewsParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const slug = params.slug?.join('/') ?? '';
  const post = getNewsPost(slug);
  if (!post) notFound();

  return {
    title: `${post.title} · stagewise Newsroom`,
    description: post.description,
    openGraph: {
      title: `${post.title} · stagewise Newsroom`,
      description: post.description,
      locale: 'en_US',
      images: post.ogImage ? [post.ogImage] : undefined,
    },
    twitter: {
      title: `${post.title} · stagewise Newsroom`,
      description: post.description,
      creator: '@stagewise_io',
    },
    category: 'News',
    applicationName: 'stagewise',
    publisher: 'stagewise',
  };
}
