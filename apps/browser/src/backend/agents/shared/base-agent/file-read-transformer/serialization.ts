/**
 * Serialization utilities for cache round-tripping of `FileTransformResult`.
 *
 * Converts between live model message parts (which may contain `Uint8Array`
 * binary data) and a JSON-safe representation suitable for SQLite storage.
 */

import type { TextPart, ImagePart, FilePart } from 'ai';
import type {
  FileTransformResult,
  SerializedPart,
  SerializedTransformResult,
} from './types';

// ---------------------------------------------------------------------------
// Serialize (result → cache string)
// ---------------------------------------------------------------------------

/**
 * Convert a `FileTransformResult` into a JSON string for cache storage.
 *
 * Binary data in `ImagePart` and `FilePart` is base64-encoded.
 */
export function serializeTransformResult(result: FileTransformResult): string {
  const serialized: SerializedTransformResult = {
    metadata: result.metadata,
    parts: result.parts.map(serializePart),
    effectiveReadParams: result.effectiveReadParams,
  };
  return JSON.stringify(serialized);
}

function serializePart(part: TextPart | ImagePart | FilePart): SerializedPart {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };

    case 'image': {
      const raw = part.image;
      const buf =
        typeof raw === 'string'
          ? Buffer.from(raw, 'base64')
          : raw instanceof URL
            ? Buffer.from(raw.toString(), 'utf-8')
            : raw instanceof ArrayBuffer
              ? Buffer.from(new Uint8Array(raw))
              : Buffer.from(raw);
      return {
        type: 'image',
        mediaType: part.mediaType ?? 'image/webp',
        dataBase64: buf.toString('base64'),
      };
    }

    case 'file': {
      const rawData = part.data;
      const data =
        typeof rawData === 'string'
          ? Buffer.from(rawData, 'base64')
          : rawData instanceof URL
            ? Buffer.from(rawData.toString(), 'utf-8')
            : rawData instanceof ArrayBuffer
              ? Buffer.from(new Uint8Array(rawData))
              : Buffer.from(rawData);
      return {
        type: 'file',
        mediaType: part.mediaType,
        dataBase64: data.toString('base64'),
        filename: part.filename,
      };
    }

    default:
      // Unknown part type — store as text placeholder.
      return {
        type: 'text',
        text: '[unsupported part type]',
      };
  }
}

// ---------------------------------------------------------------------------
// Deserialize (cache string → result)
// ---------------------------------------------------------------------------

/**
 * Reconstruct a `FileTransformResult` from a cached JSON string.
 *
 * Base64-encoded binary data is converted back to `Uint8Array`.
 * Returns `null` if parsing fails (corrupted cache entry).
 */
export function deserializeTransformResult(
  cached: string,
): FileTransformResult | null {
  try {
    const parsed: SerializedTransformResult = JSON.parse(cached);
    if (!parsed.parts || !Array.isArray(parsed.parts)) return null;

    const parts: (TextPart | ImagePart | FilePart)[] =
      parsed.parts.map(deserializePart);

    return {
      metadata: parsed.metadata ?? {},
      parts,
      effectiveReadParams: parsed.effectiveReadParams,
    };
  } catch {
    return null;
  }
}

function deserializePart(sp: SerializedPart): TextPart | ImagePart | FilePart {
  switch (sp.type) {
    case 'text':
      return { type: 'text', text: sp.text };

    case 'image':
      return {
        type: 'image',
        image: new Uint8Array(Buffer.from(sp.dataBase64, 'base64')),
        mediaType: sp.mediaType,
      } satisfies ImagePart;

    case 'file':
      return {
        type: 'file',
        data: new Uint8Array(Buffer.from(sp.dataBase64, 'base64')),
        mediaType: sp.mediaType,
        filename: sp.filename,
      } satisfies FilePart;

    default:
      return { type: 'text', text: '[unknown cached part type]' };
  }
}
