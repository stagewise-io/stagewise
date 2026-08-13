import {
  MAX_GENERATED_IMAGE_BYTES,
  MAX_GENERATED_IMAGES,
  type ProviderImageGenerationResult,
} from './types';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';

const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}
blockedAddresses.addSubnet('::', 128, 'ipv6');
blockedAddresses.addSubnet('::1', 128, 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');

async function assertPublicImageUrl(url: URL): Promise<void> {
  if (url.protocol !== 'https:') {
    throw new Error('Generated image URL must use HTTPS');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) =>
      blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4'),
    )
  ) {
    throw new Error('Generated image URL must use a public host');
  }
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error('Generated image exceeds the size limit');
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error('Generated image exceeds the size limit');
    }
    chunks.push(value);
  }

  const data = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

export async function readImageJson<T>(
  response: Response,
  maxBytes = 1024 * 1024,
): Promise<T> {
  return JSON.parse(
    new TextDecoder().decode(await readResponseBytes(response, maxBytes)),
  ) as T;
}

export function imageApiEndpoint(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function postImageJson<T>(
  url: string,
  apiKey: string,
  body: unknown,
  abortSignal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });
  if (!response.ok) {
    throw new Error(
      `Image generation failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
    );
  }
  return readImageJson<T>(response);
}

export async function downloadGeneratedImages(
  urls: string[],
  abortSignal?: AbortSignal,
): Promise<ProviderImageGenerationResult> {
  if (urls.length === 0) {
    throw new Error('Image provider returned no images');
  }
  if (urls.length > MAX_GENERATED_IMAGES) {
    throw new Error('Image provider returned too many images');
  }
  const images: ProviderImageGenerationResult['images'][number][] = [];
  let totalBytes = 0;
  for (const url of urls) {
    const parsedUrl = new URL(url);
    await assertPublicImageUrl(parsedUrl);
    const response = await fetch(parsedUrl, {
      signal: abortSignal,
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Generated image download failed (${response.status})`);
    }
    const data = await readResponseBytes(
      response,
      MAX_GENERATED_IMAGE_BYTES - totalBytes,
    );
    totalBytes += data.byteLength;
    images.push({
      base64: Buffer.from(data).toString('base64'),
      mediaType:
        response.headers
          .get('content-type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() ?? 'image/png',
    });
  }
  return { images };
}
