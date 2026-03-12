import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  generateNewsPostOgImage,
  loadGeistMedium,
} from '@/lib/og-image';
import { getNewsPost } from '@/lib/source';
import { notFound } from 'next/navigation';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const post = getNewsPost(slug);
  if (!post) notFound();

  const geistMedium = loadGeistMedium();
  return generateNewsPostOgImage({
    postTitle: post.title,
    postDate: post.date,
    geistFont: geistMedium,
  });
}
