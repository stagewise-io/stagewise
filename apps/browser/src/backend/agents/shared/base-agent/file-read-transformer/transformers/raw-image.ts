/**
 * Raw camera image transformer.
 *
 * Handles raw camera file formats (NEF, CR2, ARW, DNG, ORF, RW2, RAF,
 * etc.) that `sharp` cannot decode. Extracts:
 *
 *   1. EXIF metadata from the TIFF-based header (camera model, ISO,
 *      shutter speed, aperture, focal length, date, dimensions).
 *   2. The largest embedded JPEG preview by scanning for JPEG SOI/EOI
 *      markers, then converts it to WebP via `sharp`.
 *
 * Falls back to metadata-only output if no usable preview is found.
 */

import sharp from 'sharp';
import type { TextPart, ImagePart } from 'ai';
import type { FileTransformer, FileTransformResult } from '../types';
import { baseMetadata } from '../format-utils';

/** WebP quality for embedded previews. */
const WEBP_QUALITY = 70;

/** Minimum JPEG size to consider as a usable preview (skip tiny thumbnails). */
const MIN_PREVIEW_BYTES = 10_000;

// ---------------------------------------------------------------------------
// EXIF metadata extraction
// ---------------------------------------------------------------------------

interface RawImageMeta {
  width?: number;
  height?: number;
  format?: string;
  orientation?: number;
  density?: number;
  space?: string;
  channels?: number;
  depth?: string;
  hasProfile?: boolean;
  exifFields: Record<string, string>;
}

/**
 * Try to extract basic metadata using sharp's TIFF header reader.
 * Raw files use TIFF containers, so sharp can read the header even
 * if it can't decode the Bayer-pattern pixel data.
 */
async function extractMetadata(buf: Buffer): Promise<RawImageMeta> {
  const meta: RawImageMeta = { exifFields: {} };

  try {
    const sharpMeta = await sharp(buf).metadata();
    if (sharpMeta.width) meta.width = sharpMeta.width;
    if (sharpMeta.height) meta.height = sharpMeta.height;
    if (sharpMeta.format) meta.format = sharpMeta.format;
    if (sharpMeta.orientation) meta.orientation = sharpMeta.orientation;
    if (sharpMeta.density) meta.density = sharpMeta.density;
    if (sharpMeta.space) meta.space = sharpMeta.space;
    if (sharpMeta.channels) meta.channels = sharpMeta.channels;
    if (sharpMeta.depth) meta.depth = sharpMeta.depth;
    if (sharpMeta.hasProfile) meta.hasProfile = sharpMeta.hasProfile;

    // Parse EXIF buffer if present.
    if (sharpMeta.exif) {
      parseExifFields(sharpMeta.exif, meta.exifFields);
    }
  } catch {
    // sharp may fail on some raw formats — best-effort.
  }

  return meta;
}

/**
 * Minimal EXIF parser — extracts human-readable fields from the raw
 * EXIF buffer. Handles both big-endian (Motorola) and little-endian
 * (Intel) byte orders.
 */
function parseExifFields(
  exifBuf: Buffer,
  fields: Record<string, string>,
): void {
  try {
    // The EXIF buffer from sharp starts after the APP1 marker.
    // Check for "Exif\0\0" header.
    const hasExifHeader =
      exifBuf.length > 14 &&
      exifBuf[0] === 0x45 && // 'E'
      exifBuf[1] === 0x78 && // 'x'
      exifBuf[2] === 0x69 && // 'i'
      exifBuf[3] === 0x66 && // 'f'
      exifBuf[4] === 0x00 &&
      exifBuf[5] === 0x00;

    const tiffOffset = hasExifHeader ? 6 : 0;
    const tiffBuf = exifBuf.subarray(tiffOffset);
    if (tiffBuf.length < 8) return;

    const isBE = tiffBuf[0] === 0x4d && tiffBuf[1] === 0x4d; // 'MM'

    const read16 = isBE
      ? (o: number) => tiffBuf.readUInt16BE(o)
      : (o: number) => tiffBuf.readUInt16LE(o);
    const read32 = isBE
      ? (o: number) => tiffBuf.readUInt32BE(o)
      : (o: number) => tiffBuf.readUInt32LE(o);
    const readS32 = isBE
      ? (o: number) => tiffBuf.readInt32BE(o)
      : (o: number) => tiffBuf.readInt32LE(o);

    const ifd0Offset = read32(4);
    readIFD(tiffBuf, ifd0Offset, read16, read32, readS32, fields);
  } catch {
    // Best-effort parsing.
  }
}

/**
 * Read a single IFD and extract known tags.
 */
function readIFD(
  buf: Buffer,
  offset: number,
  read16: (o: number) => number,
  read32: (o: number) => number,
  readS32: (o: number) => number,
  fields: Record<string, string>,
): void {
  if (offset + 2 > buf.length) return;
  const count = read16(offset);
  let pos = offset + 2;

  for (let i = 0; i < count && pos + 12 <= buf.length; i++) {
    const tag = read16(pos);
    const type = read16(pos + 2);
    const numValues = read32(pos + 4);
    const valueOffset = read32(pos + 8);

    const tagName = EXIF_TAGS[tag];
    if (tagName) {
      const value = readTagValue(
        buf,
        type,
        numValues,
        valueOffset,
        pos + 8,
        read16,
        read32,
        readS32,
      );
      if (value !== undefined) {
        fields[tagName] = String(value);
      }
    }

    // Follow SubIFD pointers (EXIF IFD, GPS IFD).
    if (tag === 0x8769 || tag === 0x8825) {
      readIFD(buf, valueOffset, read16, read32, readS32, fields);
    }

    pos += 12;
  }
}

function readTagValue(
  buf: Buffer,
  type: number,
  count: number,
  valueOffset: number,
  inlineOffset: number,
  read16: (o: number) => number,
  read32: (o: number) => number,
  readS32: (o: number) => number,
): string | number | undefined {
  // For values that fit in 4 bytes, the value is stored inline.
  const dataOffset = valueSize(type, count) <= 4 ? inlineOffset : valueOffset;
  if (dataOffset + valueSize(type, count) > buf.length) return undefined;

  switch (type) {
    case 2: // ASCII string
      return buf
        .subarray(dataOffset, dataOffset + count - 1)
        .toString('ascii')
        .trim();
    case 3: // SHORT
      return read16(dataOffset);
    case 4: // LONG
      return read32(dataOffset);
    case 5: {
      // RATIONAL (unsigned)
      const num = read32(dataOffset);
      const den = read32(dataOffset + 4);
      return den ? `${num}/${den}` : String(num);
    }
    case 10: {
      // SRATIONAL (signed)
      const snum = readS32(dataOffset);
      const sden = readS32(dataOffset + 4);
      return sden ? `${snum}/${sden}` : String(snum);
    }
    default:
      return undefined;
  }
}

function valueSize(type: number, count: number): number {
  const sizes: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    7: 1,
    8: 2,
    9: 4,
    10: 8,
    12: 8,
  };
  return (sizes[type] ?? 1) * count;
}

/** Subset of EXIF tags we care about. */
const EXIF_TAGS: Record<number, string> = {
  271: 'make',
  272: 'model',
  274: 'orientation',
  306: 'dateTime',
  33434: 'exposureTime',
  33437: 'fNumber',
  34855: 'iso',
  36867: 'dateTimeOriginal',
  37386: 'focalLength',
  41989: 'focalLengthIn35mm',
  42036: 'lensModel',
};

// ---------------------------------------------------------------------------
// Embedded JPEG preview extraction
// ---------------------------------------------------------------------------

/**
 * Scan for embedded JPEG images within the raw file buffer.
 * Returns the largest one found (most likely the full-resolution preview).
 */
function findLargestEmbeddedJpeg(buf: Buffer): Buffer | null {
  const jpegs: Buffer[] = [];

  // JPEG SOI marker: 0xFF 0xD8
  // JPEG EOI marker: 0xFF 0xD9
  let searchFrom = 0;

  while (searchFrom < buf.length - 4) {
    // Find next SOI.
    const soiIdx = findMarker(buf, 0xff, 0xd8, searchFrom);
    if (soiIdx === -1) break;

    // Find matching EOI after this SOI.
    const eoiIdx = findMarker(buf, 0xff, 0xd9, soiIdx + 2);
    if (eoiIdx === -1) {
      searchFrom = soiIdx + 2;
      continue;
    }

    const jpegEnd = eoiIdx + 2;
    const jpegLen = jpegEnd - soiIdx;

    if (jpegLen >= MIN_PREVIEW_BYTES) {
      jpegs.push(buf.subarray(soiIdx, jpegEnd));
    }

    searchFrom = jpegEnd;
  }

  if (jpegs.length === 0) return null;

  // Return the largest embedded JPEG.
  jpegs.sort((a, b) => b.length - a.length);
  return jpegs[0];
}

function findMarker(
  buf: Buffer,
  b1: number,
  b2: number,
  start: number,
): number {
  for (let i = start; i < buf.length - 1; i++) {
    if (buf[i] === b1 && buf[i + 1] === b2) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export const rawImageTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  const nameForExt = originalFileName ?? mountedPath;
  const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';

  const metadata: Record<string, string> = {
    ...baseMetadata(stats.size, stats.mtime),
    format: `raw-${ext}`,
  };

  if (buf.length === 0) {
    return {
      metadata: { ...metadata, error: 'empty' },
      parts: [{ type: 'text', text: 'Empty raw image file.' }],
    };
  }

  // 1. Extract metadata.
  const meta = await extractMetadata(buf);

  if (meta.width && meta.height) {
    metadata.dimensions = `${meta.width}×${meta.height}`;
  }
  if (meta.format) metadata.detectedFormat = meta.format;
  if (meta.space) metadata.colorSpace = meta.space;
  if (meta.depth) metadata.bitDepth = meta.depth;
  if (meta.density) metadata.dpi = String(meta.density);

  // Add camera EXIF fields to metadata.
  for (const [key, value] of Object.entries(meta.exifFields)) {
    metadata[key] = value;
  }

  // ── Preview mode ─────────────────────────────────────────────────
  // Return EXIF metadata only — no embedded preview image.
  if (ctx.readParams.preview) {
    metadata.preview = 'true';
    const parts: (TextPart | ImagePart)[] = [
      {
        type: 'text',
        text: `Raw camera image (${ext.toUpperCase()}). Use the readFile tool without preview to see the embedded preview image.`,
      },
    ];
    return {
      metadata,
      parts,
      effectiveReadParams: { preview: true },
    };
  }

  // 2. Try to extract and convert embedded JPEG preview.
  const parts: (TextPart | ImagePart)[] = [];

  const jpegBuf = findLargestEmbeddedJpeg(buf);
  if (jpegBuf) {
    try {
      const webpBuf = await sharp(jpegBuf)
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const previewMeta = await sharp(jpegBuf).metadata();
      if (previewMeta.width && previewMeta.height) {
        metadata.previewDimensions = `${previewMeta.width}×${previewMeta.height}`;
      }

      parts.push({
        type: 'text',
        text: 'Embedded preview image from raw camera file:',
      });
      parts.push({
        type: 'image',
        image: new Uint8Array(webpBuf),
        mediaType: 'image/webp',
      });
    } catch {
      // Preview decode failed — fall through to text-only.
      parts.push({
        type: 'text',
        text: `Raw camera image (${ext.toUpperCase()}). No usable embedded preview could be extracted. Use fs.readFile('${mountedPath}') for raw access.`,
      });
    }
  } else {
    parts.push({
      type: 'text',
      text: `Raw camera image (${ext.toUpperCase()}). No embedded preview found. Use fs.readFile('${mountedPath}') for raw access.`,
    });
  }

  return { metadata, parts };
};
