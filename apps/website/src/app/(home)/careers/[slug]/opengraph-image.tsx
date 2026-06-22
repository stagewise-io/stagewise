import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  generateJobOgImage,
  loadGeistMedium,
} from '@/lib/og-image';
import { getJob } from '@/lib/source';
import { notFound } from 'next/navigation';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const job = getJob(slug);
  if (!job) notFound();

  const geistMedium = loadGeistMedium();
  return generateJobOgImage({
    jobTitle: job.title,
    jobLocation: job.location,
    geistFont: geistMedium,
  });
}
