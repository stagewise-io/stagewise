/**
 * Unit tests for the image pre-processing pipeline.
 *
 * All tests use real image buffers produced by sharp so the behaviour
 * reflects the actual codec path, not mocks.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { processImageForModel } from './image-processor';
import type { ModalityConstraint } from '@shared/karton-contracts/ui/shared-types';

// ---------------------------------------------------------------------------
// Helpers — generate minimal real image buffers
// ---------------------------------------------------------------------------

/** Create a solid-colour PNG of the given dimensions. */
async function makePng(
  width: number,
  height: number,
  rgb: [number, number, number] = [100, 150, 200],
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

/** Create a solid-colour JPEG of the given dimensions. */
async function makeJpeg(
  width: number,
  height: number,
  rgb: [number, number, number] = [200, 100, 50],
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Create a solid-colour WebP of the given dimensions. */
async function makeWebp(
  width: number,
  height: number,
  rgb: [number, number, number] = [50, 200, 150],
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

/** Return actual decoded dimensions of a buffer via sharp. */
async function getDimensions(
  buf: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buf).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

// ---------------------------------------------------------------------------
// Shared constraints
// ---------------------------------------------------------------------------

const CONSTRAINT_PERMISSIVE: ModalityConstraint = {
  mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxBytes: 10_000_000, // 10 MB — nothing should trigger
};

// Patch-based (1,536 patches × 32² = 1,572,864 px) + 2048 per-axis limit
const CONSTRAINT_OPENAI: ModalityConstraint = {
  mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxBytes: 5_242_880,
  maxWidthPx: 2048,
  maxHeightPx: 2048,
  maxTotalPixels: 1_572_864,
};

// Patch-based (2,500 patches × 32² = 2,560,000 px) + 2048 per-axis limit (GPT-5.4+)
const CONSTRAINT_GPT54: ModalityConstraint = {
  mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxBytes: 5_242_880,
  maxWidthPx: 2048,
  maxHeightPx: 2048,
  maxTotalPixels: 2_560_000,
};

const CONSTRAINT_ANTHROPIC: ModalityConstraint = {
  mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxBytes: 5_242_880,
  maxWidthPx: 8000,
  maxHeightPx: 8000,
  maxTotalPixels: 1_200_000, // Anthropic 1.2 MP per-image limit
};

// ---------------------------------------------------------------------------
// ── Fast-path ───────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – fast-path (no transformation needed)', () => {
  it('returns the original WebP buffer unchanged when already optimal', async () => {
    const buf = await makeWebp(400, 300);
    const result = await processImageForModel(
      buf,
      'image/webp',
      CONSTRAINT_PERMISSIVE,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(false);
    expect(result.buf).toBe(buf); // exact same reference
    expect(result.mediaType).toBe('image/webp');
  });

  it('PNG within limits is still re-encoded to WebP (always-WebP policy)', async () => {
    const buf = await makePng(100, 100);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/png', 'image/webp'],
      maxBytes: 10_000_000,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // PNG is not WebP — must be re-encoded
    expect(result.transformed).toBe(true);
    expect(result.mediaType).toBe('image/webp');
    const meta = await sharp(result.buf).metadata();
    expect(meta.format).toBe('webp');
  });

  it('JPEG within limits is re-encoded to WebP (always-WebP policy)', async () => {
    const buf = await makeJpeg(100, 100);
    const result = await processImageForModel(
      buf,
      'image/jpeg',
      CONSTRAINT_PERMISSIVE,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);
    expect(result.mediaType).toBe('image/webp');
  });
});

// ---------------------------------------------------------------------------
// ── MIME conversion ──────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – MIME conversion', () => {
  it('converts PNG to WebP regardless of whether PNG is in allowed mimeTypes', async () => {
    const buf = await makePng(200, 200);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/webp'], // PNG not listed
      maxBytes: 10_000_000,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);
    expect(result.mediaType).toBe('image/webp');

    // Verify the output is actually a valid WebP
    const meta = await sharp(result.buf).metadata();
    expect(meta.format).toBe('webp');
  });

  it('converts JPEG to WebP regardless of whether JPEG is in allowed mimeTypes', async () => {
    const buf = await makeJpeg(200, 200);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/webp'],
      maxBytes: 10_000_000,
    };
    const result = await processImageForModel(buf, 'image/jpeg', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mediaType).toBe('image/webp');
    const meta = await sharp(result.buf).metadata();
    expect(meta.format).toBe('webp');
  });

  it('normalises mediaType to lowercase before comparison', async () => {
    const buf = await makeWebp(100, 100);
    const result = await processImageForModel(
      buf,
      'IMAGE/WEBP',
      CONSTRAINT_PERMISSIVE,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Already WebP within limits — fast-path, no transformation
    expect(result.transformed).toBe(false);
    expect(result.mediaType).toBe('image/webp');
  });
});

// ---------------------------------------------------------------------------
// ── Resize: per-axis limits ──────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – per-axis resize', () => {
  it('downscales width when it exceeds maxWidthPx', async () => {
    // 3000×500 — width exceeds 2048, height does not
    const buf = await makePng(3000, 500);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 10_000_000,
      maxWidthPx: 2048,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width).toBeLessThanOrEqual(2048);
    // Height must be scaled proportionally: 500 * (2048/3000) ≈ 341
    expect(height).toBeLessThanOrEqual(342);
  });

  it('downscales height when it exceeds maxHeightPx', async () => {
    // 400×3000 — height exceeds 2048, width does not
    const buf = await makePng(400, 3000);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 10_000_000,
      maxHeightPx: 2048,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { width, height } = await getDimensions(result.buf);
    expect(height).toBeLessThanOrEqual(2048);
    // Width scaled proportionally: 400 * (2048/3000) ≈ 273
    expect(width).toBeLessThanOrEqual(274);
  });

  it('applies both width and height limits — most restrictive axis wins', async () => {
    // 3000×4000 — height is the tighter axis against 2048
    const buf = await makePng(3000, 4000);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 10_000_000,
      maxWidthPx: 2048,
      maxHeightPx: 2048,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { width, height } = await getDimensions(result.buf);
    expect(width).toBeLessThanOrEqual(2048);
    expect(height).toBeLessThanOrEqual(2048);
  });

  it('does not upscale an image smaller than the axis limits', async () => {
    const buf = await makePng(500, 300);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 10_000_000,
      maxWidthPx: 2048,
      maxHeightPx: 2048,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { width, height } = await getDimensions(result.buf);
    expect(width).toBeLessThanOrEqual(500);
    expect(height).toBeLessThanOrEqual(300);
  });

  it('per-axis cap and total-pixel cap both apply: wide image hits axis first', async () => {
    // 3000×100 = 300K px (well under 1.54MP) but width > 2048
    // Per-axis clamp fires; total-pixel cap is irrelevant here.
    const buf = await makePng(3000, 100);
    const result = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { width, height } = await getDimensions(result.buf);
    expect(width).toBeLessThanOrEqual(2048);
    // After axis clamp: 2048×68 = 139K px — still within total-pixel budget
    expect(width * height).toBeLessThanOrEqual(1_572_864);
  });

  it('per-axis cap and total-pixel cap both apply: square image hits pixel cap first', async () => {
    // 1800×1800 = 3.24MP > 1.54MP, but both axes < 2048
    // Total-pixel cap fires before axis cap.
    const buf = await makePng(1800, 1800);
    const result = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { width, height } = await getDimensions(result.buf);
    expect(width).toBeLessThanOrEqual(2048);
    expect(height).toBeLessThanOrEqual(2048);
    expect(width * height).toBeLessThanOrEqual(1_572_864);
  });
});

// ---------------------------------------------------------------------------
// ── Resize: total pixel cap ──────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – total pixel cap', () => {
  it('downscales when total pixels exceed maxTotalPixels (OpenAI 1.54MP)', async () => {
    // 3000×2000 = 6MP — far exceeds the 1.54MP cap
    const buf = await makePng(3000, 2000);
    const result = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(1_572_864);
  });

  it('wide panorama is scaled by area, not axis (4000×500 = 2MP)', async () => {
    // 4000×500 = 2MP > 1.54MP but neither axis alone would be over a 2048 limit.
    // Total-pixel cap correctly handles this without per-axis logic.
    const buf = await makePng(4000, 500);
    const result = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(1_572_864);
    // Aspect ratio preserved: 4000×500 is 8:1 — width should still be much larger than height
    expect(width).toBeGreaterThan(height * 4);
  });

  it('GPT-5.4 has a larger 2.5MP cap vs standard OpenAI 1.54MP', async () => {
    // 1600×1200 = 1.92MP — both axes < 2048, over OpenAI (1.54MP) but under GPT-5.4 (2.5MP)
    // This isolates the total-pixel difference without the per-axis limit interfering.
    const buf = await makePng(1600, 1200);

    const openaiResult = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_OPENAI,
    );
    const gpt54Result = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_GPT54,
    );

    expect(openaiResult.ok).toBe(true);
    expect(gpt54Result.ok).toBe(true);
    if (!openaiResult.ok || !gpt54Result.ok) return;

    // OpenAI: 1.92MP > 1.54MP — must be resized
    const openaiDims = await getDimensions(openaiResult.buf);
    expect(openaiDims.width * openaiDims.height).toBeLessThanOrEqual(1_572_864);

    // GPT-5.4: 1.92MP < 2.5MP — no pixel resize, so dimensions stay at original
    const gpt54Dims = await getDimensions(gpt54Result.buf);
    expect(gpt54Dims.width).toBeLessThanOrEqual(1600);
    expect(gpt54Dims.height).toBeLessThanOrEqual(1200);
    expect(gpt54Dims.width * gpt54Dims.height).toBeLessThanOrEqual(2_560_000);
    // GPT-5.4 result must have more pixels than the OpenAI-resized result
    expect(gpt54Dims.width * gpt54Dims.height).toBeGreaterThan(
      openaiDims.width * openaiDims.height,
    );
  });
});

// ---------------------------------------------------------------------------
// ── Byte-size compression ────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – byte-size compression', () => {
  it('compresses to WebP when file exceeds maxBytes after resize', async () => {
    // A solid-colour 1000×1000 PNG compresses to ~16 KB.
    // Set maxBytes below that so the processor must re-encode to WebP.
    const buf = await makePng(1000, 1000);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 10_000, // below the ~16 KB the PNG actually is
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);
    expect(result.buf.length).toBeLessThanOrEqual(10_000);
    expect(result.mediaType).toBe('image/webp');
  });

  it('output is always image/webp regardless of input format', async () => {
    // The always-WebP policy means JPEG is re-encoded even when within limits.
    const buf = await makeJpeg(800, 800);
    const result = await processImageForModel(
      buf,
      'image/jpeg',
      CONSTRAINT_PERMISSIVE,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mediaType).toBe('image/webp');

    const meta = await sharp(result.buf).metadata();
    expect(meta.format).toBe('webp');
  });

  it('returns ok:false when image cannot be compressed to fit maxBytes', async () => {
    // A 1000×1000 image cannot be compressed below ~1 KB at any quality.
    // Set maxBytes to an impossibly small value (1 byte).
    const buf = await makePng(1000, 1000);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 1, // impossible
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(Error);
    // Original buffer is returned unchanged
    expect(result.buf).toBe(buf);
    expect(result.mediaType).toBe('image/png');
  });
});

// ---------------------------------------------------------------------------
// ── Error handling ───────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – error handling', () => {
  it('returns ok:false for a corrupted / non-image buffer', async () => {
    const garbage = Buffer.from('this is not an image');
    const result = await processImageForModel(
      garbage,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeDefined();
    // Original buffer returned
    expect(result.buf).toBe(garbage);
  });

  it('returns ok:false for an empty buffer', async () => {
    const empty = Buffer.alloc(0);
    const result = await processImageForModel(
      empty,
      'image/webp',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(false);
  });

  it('never throws — always resolves', async () => {
    const garbage = Buffer.from('garbage data ###');
    await expect(
      processImageForModel(garbage, 'image/jpeg', CONSTRAINT_OPENAI),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ── Real-world constraint profiles ──────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – provider constraint profiles', () => {
  let oversizedBuf: Buffer;

  beforeAll(async () => {
    // 2500×2500 — over OpenAI (2000px/4MP) and GPT-5.4 (3000px but 6.25MP < 9MP is ok)
    oversizedBuf = await makePng(2500, 2500);
  });

  it('OpenAI: 2500×2500 (6.25MP) is downscaled to fit 1.54MP patch cap', async () => {
    const result = await processImageForModel(
      oversizedBuf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(1_572_864);
    expect(result.buf.length).toBeLessThanOrEqual(CONSTRAINT_OPENAI.maxBytes);
  });

  it('GPT-5.4: 2500×2500 (6.25MP) is downscaled to fit 2.5MP patch cap', async () => {
    const result = await processImageForModel(
      oversizedBuf,
      'image/png',
      CONSTRAINT_GPT54,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(2_560_000);
    expect(result.buf.length).toBeLessThanOrEqual(CONSTRAINT_GPT54.maxBytes);
  });

  it('Anthropic: 2500×2500 (6.25MP) is downscaled to fit 1.2 MP cap', async () => {
    const result = await processImageForModel(
      oversizedBuf,
      'image/png',
      CONSTRAINT_ANTHROPIC,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(1_200_000);
    expect(result.buf.length).toBeLessThanOrEqual(
      CONSTRAINT_ANTHROPIC.maxBytes,
    );
    expect(result.mediaType).toBe('image/webp');
  });

  it('OpenAI: very large 4000×4000 (16MP) image is resized to 1.54MP and compressed', async () => {
    const bigBuf = await makePng(4000, 4000);
    const result = await processImageForModel(
      bigBuf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transformed).toBe(true);

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(1_572_864);
    expect(result.buf.length).toBeLessThanOrEqual(CONSTRAINT_OPENAI.maxBytes);
    expect(result.mediaType).toBe('image/webp');
  });
});

// ---------------------------------------------------------------------------
// ── Aspect ratio preservation ────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('processImageForModel – aspect ratio', () => {
  it('preserves aspect ratio on total-pixel-cap resize (16:9)', async () => {
    // 3200×1800 = 5.76MP — exceeds 1.54MP OpenAI cap
    const buf = await makePng(3200, 1800);
    const result = await processImageForModel(
      buf,
      'image/png',
      CONSTRAINT_OPENAI,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { width, height } = await getDimensions(result.buf);
    expect(width * height).toBeLessThanOrEqual(1_572_864);
    const aspectRatio = width / height;
    expect(aspectRatio).toBeCloseTo(16 / 9, 1);
  });

  it('preserves aspect ratio on height-triggered per-axis resize (portrait)', async () => {
    const buf = await makePng(1000, 3000); // 1:3 portrait
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 10_000_000,
      maxHeightPx: 1000,
    };
    const result = await processImageForModel(buf, 'image/png', constraint);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { width, height } = await getDimensions(result.buf);
    expect(height).toBeLessThanOrEqual(1000);
    const aspectRatio = width / height;
    expect(aspectRatio).toBeCloseTo(1 / 3, 1);
  });
});
