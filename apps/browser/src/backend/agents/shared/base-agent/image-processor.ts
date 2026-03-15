/**
 * Image pre-processing pipeline for model input.
 *
 * Before an image buffer is passed to a model as an inline ImagePart, this
 * module ensures it satisfies the model's `ModalityConstraint` by:
 *
 *   1. Converting unsupported MIME types → WebP (universally accepted).
 *   2. Downscaling when width, height, or total pixel count exceed the limit.
 *   3. Compressing (WebP quality reduction) when the file is still too large
 *      after downscaling.
 *
 * All transformations are performed in-process using `sharp` (libvips), which
 * is already a native dependency rebuilt by Electron Forge.
 *
 * On any processing failure the original buffer and MIME are returned
 * unchanged together with `{ ok: false, error }` so the caller can fall back
 * to the existing "model cannot consume this attachment" path.
 */

import sharp from 'sharp';
import type { ModalityConstraint } from '@shared/karton-contracts/ui/shared-types';
import type { Logger } from '@/services/logger';
import type { ProcessedImageCacheService } from '@/services/processed-image-cache';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImageProcessResult =
  | {
      ok: true;
      buf: Buffer;
      mediaType: string;
      /** True when the buffer was actually modified (resize / re-encode). */
      transformed: boolean;
    }
  | {
      ok: false;
      /** The original, unmodified buffer. */
      buf: Buffer;
      mediaType: string;
      error: unknown;
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * MIME types that can be decoded by sharp and sent inline to all providers.
 * Everything else gets converted to WebP.
 */
const _SUPPORTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/**
 * Preferred output format when WebP is allowed by the constraint.
 * WebP:
 *  - No DCT block artifacts (critical for screenshots / text-heavy images)
 *  - ~25–35 % smaller than JPEG at equivalent visual quality
 *  - Universally accepted by Anthropic, OpenAI, and Google
 */
const OUTPUT_MIME = 'image/webp';

/**
 * Determine the best output MIME type allowed by the constraint.
 * Preference order: WebP → JPEG → PNG.
 * Falls back to WebP if none of the preferred formats are listed (should not
 * happen with well-formed constraints, but avoids a hard failure).
 */
function pickOutputMime(constraint: { mimeTypes: string[] }): string {
  const allowed = constraint.mimeTypes;
  if (allowed.includes('image/webp')) return 'image/webp';
  if (allowed.includes('image/jpeg')) return 'image/jpeg';
  if (allowed.includes('image/png')) return 'image/png';
  return OUTPUT_MIME; // fallback — WebP is universally supported
}

/** WebP quality steps tried in order when the byte limit is still exceeded. */
const QUALITY_STEPS = [80, 65, 50] as const;

/** Minimum quality we will encode at — below this we give up and return ok:false. */
const MIN_QUALITY = QUALITY_STEPS[QUALITY_STEPS.length - 1];

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

/**
 * Process an image buffer to fit within the limits expressed by `constraint`.
 *
 * Safe to call from any async context in the Electron main process.
 * Never throws — failures are reported via `{ ok: false, error }`.
 */
export async function processImageForModel(
  rawBuf: Buffer,
  mediaType: string,
  constraint: ModalityConstraint,
  logger?: Logger,
  cache?: ProcessedImageCacheService,
): Promise<ImageProcessResult> {
  const mime = mediaType.toLowerCase();
  const startMs = Date.now();

  // ── Cache lookup ──────────────────────────────────────────────────────────
  if (cache) {
    try {
      const cached = await cache.get(rawBuf, constraint);
      if (cached) {
        logger?.debug(
          `[ImageProcessor] Cache hit — returning ${cached.buf.length} bytes ${cached.mediaType} (${Date.now() - startMs}ms)`,
        );
        return {
          ok: true,
          buf: cached.buf,
          mediaType: cached.mediaType,
          transformed: true,
        };
      }
    } catch (cacheErr) {
      logger?.warn(
        `[ImageProcessor] Cache lookup failed, proceeding as cache miss: ${cacheErr}`,
      );
    }
  }

  // Fast-path: only skip processing when the image is already in the chosen
  // output format (per constraint), already fits within all constraints, and
  // no resolution limits apply.  Otherwise the image is funnelled through
  // the encode pipeline with the best allowed format.
  const noResolutionLimits =
    constraint.maxWidthPx === undefined &&
    constraint.maxHeightPx === undefined &&
    constraint.maxTotalPixels === undefined;

  const outputMime = pickOutputMime(constraint);

  if (
    noResolutionLimits &&
    rawBuf.length <= constraint.maxBytes &&
    mime === outputMime
  ) {
    return { ok: true, buf: rawBuf, mediaType: mime, transformed: false };
  }

  try {
    const image = sharp(rawBuf, { animated: false });
    const meta = await image.metadata();

    const origWidth = meta.width ?? 0;
    const origHeight = meta.height ?? 0;

    // ── Step 1: compute target dimensions ─────────────────────────────────

    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > 0 && origHeight > 0) {
      // Per-axis limits
      if (
        constraint.maxWidthPx !== undefined &&
        targetWidth > constraint.maxWidthPx
      ) {
        const ratio = constraint.maxWidthPx / targetWidth;
        targetWidth = constraint.maxWidthPx;
        targetHeight = Math.round(targetHeight * ratio);
      }
      if (
        constraint.maxHeightPx !== undefined &&
        targetHeight > constraint.maxHeightPx
      ) {
        const ratio = constraint.maxHeightPx / targetHeight;
        targetHeight = constraint.maxHeightPx;
        targetWidth = Math.round(targetWidth * ratio);
      }

      // Total pixel cap (applied after per-axis to handle panoramas etc.)
      if (constraint.maxTotalPixels !== undefined) {
        const totalPixels = targetWidth * targetHeight;
        if (totalPixels > constraint.maxTotalPixels) {
          const scale = Math.sqrt(constraint.maxTotalPixels / totalPixels);
          targetWidth = Math.round(targetWidth * scale);
          targetHeight = Math.round(targetHeight * scale);
        }
      }
    }

    const needsResize =
      targetWidth !== origWidth || targetHeight !== origHeight;
    // Always encode to WebP — better compression, universally accepted,
    // and avoids sending JPEG/PNG artefacts to models.
    // Only skip encoding if the image is already WebP, correctly sized,
    // and within the byte limit.
    const alreadyOptimal =
      !needsResize &&
      mime === outputMime &&
      rawBuf.length <= constraint.maxBytes;

    if (alreadyOptimal) {
      return { ok: true, buf: rawBuf, mediaType: mime, transformed: false };
    }

    if (needsResize) {
      logger?.debug(
        `[ImageProcessor] Resize: ${origWidth}×${origHeight} → ${targetWidth}×${targetHeight}`,
      );
    }

    // ── Step 2: resize + encode at each quality step until size fits ──────

    for (const quality of QUALITY_STEPS) {
      let pipeline = sharp(rawBuf, { animated: false });

      if (needsResize) {
        pipeline = pipeline.resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Encode to the best format allowed by the constraint.
      if (outputMime === 'image/jpeg') {
        pipeline = pipeline.jpeg({ quality });
      } else if (outputMime === 'image/png') {
        // PNG is lossless; quality is ignored — use compressionLevel as proxy.
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else {
        // Default: WebP (preferred format).
        pipeline = pipeline.webp({ quality });
      }

      const outBuf = await pipeline.toBuffer();

      if (outBuf.length <= constraint.maxBytes) {
        logger?.debug(
          `[ImageProcessor] Output: ${outputMime}, ${outBuf.length} bytes` +
            (needsResize
              ? `, resized ${origWidth}×${origHeight} → ${targetWidth}×${targetHeight}`
              : '') +
            `, quality=${quality}, duration=${Date.now() - startMs}ms`,
        );
        const result: ImageProcessResult = {
          ok: true,
          buf: outBuf,
          mediaType: outputMime,
          transformed: true,
        };
        // Store in cache asynchronously — do not block the caller.
        if (cache) {
          cache
            .set(rawBuf, constraint, { buf: outBuf, mediaType: outputMime })
            .catch((e: unknown) => {
              logger?.debug(
                `[ImageProcessor] Cache write failed: ${e instanceof Error ? e.message : String(e)}`,
              );
            });
        }
        return result;
      }

      // If we've hit the minimum quality and it's still over the limit,
      // bail out — returning ok:false lets the caller use the existing
      // "cannot send this attachment" fallback path.
      if (quality === MIN_QUALITY) {
        logger?.debug(
          `[ImageProcessor] Failed: cannot compress below ${constraint.maxBytes} bytes (${outBuf.length} bytes at min quality ${MIN_QUALITY}%, duration=${Date.now() - startMs}ms)`,
        );
        return {
          ok: false,
          buf: rawBuf,
          mediaType: mime,
          error: new Error(
            `Image cannot be compressed below ${constraint.maxBytes} bytes ` +
              `(${outBuf.length} bytes at minimum quality ${MIN_QUALITY}%).`,
          ),
        };
      }
    }

    // Unreachable, but satisfies TypeScript exhaustiveness.
    return {
      ok: false,
      buf: rawBuf,
      mediaType: mime,
      error: new Error(
        'Exhausted all quality steps without fitting byte limit.',
      ),
    };
  } catch (err) {
    // sharp decode failure (corrupted / unsupported format), propagate as
    // ok:false so the caller falls back to the rejection path.
    logger?.debug(
      `[ImageProcessor] Error decoding image (${mime}, ${rawBuf.length} bytes, duration=${Date.now() - startMs}ms): ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, buf: rawBuf, mediaType: mime, error: err };
  }
}
