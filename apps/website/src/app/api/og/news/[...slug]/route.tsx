import {
  generateNewsPostOgImage,
  loadGeistMedium,
  OG_CONTENT_TYPE,
} from '@/lib/og-image';
import { getNewsPost } from '@/lib/source';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const post = getNewsPost(slug.join('/'));

  if (!post) {
    return new Response('Not found', { status: 404 });
  }

  const geistMedium = loadGeistMedium();
  const response = generateNewsPostOgImage({
    postTitle: post.title,
    geistFont: geistMedium,
  });

  return new Response(await response.arrayBuffer(), {
    headers: {
      'Content-Type': OG_CONTENT_TYPE,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
