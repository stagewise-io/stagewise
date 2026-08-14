import {
  MAX_GENERATED_IMAGE_BYTES,
  type ProviderImageGenerationResult,
} from './types';
import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { BlockList } from 'node:net';

const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
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

async function resolvePublicImageAddress(url: URL) {
  if (url.protocol !== 'https:') {
    throw new Error('Generated image URL must use HTTPS');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) =>
      family === 6 && address.toLowerCase().startsWith('::ffff:')
        ? true
        : blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4'),
    )
  ) {
    throw new Error('Generated image URL must use a public host');
  }
  return addresses[0]!;
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

export async function readImageText(
  response: Response,
  maxBytes = 64 * 1024,
): Promise<string> {
  return new TextDecoder().decode(await readResponseBytes(response, maxBytes));
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
      `Image generation failed (${response.status}): ${(await readImageText(response)).slice(0, 500)}`,
    );
  }
  return readImageJson<T>(response);
}

async function downloadGeneratedImageBytes(
  url: URL,
  maxBytes: number,
  abortSignal?: AbortSignal,
) {
  const address = await resolvePublicImageAddress(url);
  return new Promise<{ data: Buffer; mediaType: string }>((resolve, reject) => {
    const request = get(
      url,
      {
        signal: abortSignal,
        timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Generated image download failed (${status})`));
          return;
        }
        const declaredSize = Number(response.headers['content-length']);
        if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
          response.destroy();
          reject(new Error('Generated image exceeds the size limit'));
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > maxBytes) {
            response.destroy(
              new Error('Generated image exceeds the size limit'),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            data: Buffer.concat(chunks, totalBytes),
            mediaType:
              response.headers['content-type']
                ?.split(';')[0]
                ?.trim()
                .toLowerCase() ?? 'image/png',
          }),
        );
        response.on('error', reject);
      },
    );
    request.on('timeout', () =>
      request.destroy(new Error('Generated image download timed out')),
    );
    request.on('error', reject);
  });
}

export async function downloadGeneratedImage(
  urls: string[],
  abortSignal?: AbortSignal,
): Promise<ProviderImageGenerationResult> {
  if (urls.length === 0) {
    throw new Error('Image provider returned no images');
  }
  if (urls.length > 1) {
    throw new Error('Image provider returned multiple images');
  }
  const { data, mediaType } = await downloadGeneratedImageBytes(
    new URL(urls[0]!),
    MAX_GENERATED_IMAGE_BYTES,
    abortSignal,
  );
  return {
    image: {
      base64: data.toString('base64'),
      mediaType,
    },
  };
}
