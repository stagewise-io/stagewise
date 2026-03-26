/**
 * Image transformer.
 *
 * Converts images to WebP at quality 80 via `sharp`, then returns an
 * `ImagePart`. This ensures a compact, model-ready representation
 * regardless of the input format (PNG, JPEG, GIF, BMP, AVIF, ICO).
 *
 * The resulting WebP buffer is what gets stored in the file-read cache,
 * so subsequent injections skip all image processing.
 *
 * Supports:
 *   - `preview` — return metadata-only summary (dimensions, format)
 *     without the actual image data, saving context budget
 */

import sharp from 'sharp';
import type { FileTransformer, FileTransformResult } from '../types';
import { baseMetadata } from '../format-utils';

/** Default WebP quality — balances visual fidelity and size. */
const WEBP_QUALITY = 80;

export const imageTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
): Promise<FileTransformResult> => {
  const metadata = baseMetadata(stats.size, stats.mtime);

  try {
    const image = sharp(buf, { animated: false });
    const meta = await image.metadata();

    // Populate metadata (available for both preview and full modes).
    if (meta.width && meta.height) {
      metadata.dimensions = `${meta.width}×${meta.height}`;
    }
    metadata.format = 'webp';
    metadata.originalFormat = meta.format ?? 'unknown';

    // ── Preview mode ─────────────────────────────────────────────
    // Return metadata-only summary — no image data.
    if (ctx.readParams.preview) {
      metadata.preview = 'true';
      return {
        metadata,
        parts: [
          {
            type: 'text',
            text: `Image file (${metadata.originalFormat}, ${metadata.dimensions ?? 'unknown dimensions'}). Use the readFile tool without preview to see the full image.`,
          },
        ],
        effectiveReadParams: { preview: true },
      };
    }

    // ── Full mode — encode to WebP ───────────────────────────────
    const webpBuf = await image.webp({ quality: WEBP_QUALITY }).toBuffer();

    return {
      metadata,
      parts: [
        {
          type: 'image',
          image: new Uint8Array(webpBuf),
          mediaType: 'image/webp',
        },
      ],
    };
  } catch (err) {
    // sharp decode failure (corrupted / unsupported format).
    ctx.logger.warn(
      `[imageTransformer] Failed to process ${mountedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      metadata: { ...metadata, error: 'decode-failed' },
      parts: [
        {
          type: 'text',
          text: `Image could not be decoded. Use fs.readFile('${mountedPath}') in the sandbox to access raw bytes.`,
        },
      ],
    };
  }
};
