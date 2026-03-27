/**
 * Unit tests for serialization round-tripping of FileTransformResult.
 *
 * Pure functions — no filesystem or DB dependencies.
 */

import { describe, it, expect } from 'vitest';
import type { TextPart, ImagePart, FilePart } from 'ai';
import type { FileTransformResult } from './types';
import {
  serializeTransformResult,
  deserializeTransformResult,
} from './serialization';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTrip(result: FileTransformResult): FileTransformResult | null {
  return deserializeTransformResult(serializeTransformResult(result));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serializeTransformResult / deserializeTransformResult', () => {
  describe('text parts', () => {
    it('round-trips a single text part', () => {
      const result: FileTransformResult = {
        metadata: { size: '1.2KB', language: 'typescript' },
        parts: [{ type: 'text', text: 'const x = 1;\n' }],
      };

      const out = roundTrip(result);
      expect(out).not.toBeNull();
      expect(out!.metadata).toEqual(result.metadata);
      expect(out!.parts).toHaveLength(1);
      expect(out!.parts[0]).toEqual(result.parts[0]);
    });

    it('round-trips multiple text parts', () => {
      const result: FileTransformResult = {
        metadata: { size: '3KB' },
        parts: [
          { type: 'text', text: 'line 1' },
          { type: 'text', text: 'line 2' },
          { type: 'text', text: 'line 3' },
        ],
      };

      const out = roundTrip(result);
      expect(out!.parts).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect((out!.parts[i] as TextPart).text).toBe(
          (result.parts[i] as TextPart).text,
        );
      }
    });

    it('preserves empty text', () => {
      const result: FileTransformResult = {
        metadata: {},
        parts: [{ type: 'text', text: '' }],
      };
      const out = roundTrip(result);
      expect((out!.parts[0] as TextPart).text).toBe('');
    });

    it('preserves unicode and special characters', () => {
      const text = '日本語テスト\n\t"quotes" <angle> &amp;\n🎉';
      const result: FileTransformResult = {
        metadata: {},
        parts: [{ type: 'text', text }],
      };
      const out = roundTrip(result);
      expect((out!.parts[0] as TextPart).text).toBe(text);
    });
  });

  describe('image parts', () => {
    it('round-trips an image part with Uint8Array data', () => {
      const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
      const result: FileTransformResult = {
        metadata: { format: 'webp', dimensions: '100x200' },
        parts: [
          {
            type: 'image',
            image: imageData,
            mediaType: 'image/webp',
          } satisfies ImagePart,
        ],
      };

      const out = roundTrip(result);
      expect(out).not.toBeNull();
      expect(out!.parts).toHaveLength(1);
      const part = out!.parts[0] as ImagePart;
      expect(part.type).toBe('image');
      expect(part.mediaType).toBe('image/webp');
      // Deserialized binary should match the original bytes.
      expect(new Uint8Array(part.image as Uint8Array)).toEqual(imageData);
    });

    it('defaults mediaType to image/webp when omitted', () => {
      // The AI SDK allows omitting mediaType on ImagePart.
      const result: FileTransformResult = {
        metadata: {},
        parts: [
          { type: 'image', image: new Uint8Array([1, 2, 3]) } as ImagePart,
        ],
      };
      const serialized = serializeTransformResult(result);
      const parsed = JSON.parse(serialized);
      expect(parsed.parts[0].mediaType).toBe('image/webp');
    });

    it('handles large binary data', () => {
      const largeData = new Uint8Array(100_000);
      for (let i = 0; i < largeData.length; i++) largeData[i] = i % 256;

      const result: FileTransformResult = {
        metadata: {},
        parts: [
          {
            type: 'image',
            image: largeData,
            mediaType: 'image/png',
          } satisfies ImagePart,
        ],
      };

      const out = roundTrip(result);
      expect(new Uint8Array(out!.parts[0] as any)).not.toBeNull();
      const roundTripped = (out!.parts[0] as ImagePart).image as Uint8Array;
      expect(roundTripped.length).toBe(100_000);
      // Spot-check some bytes rather than comparing entire array.
      expect(roundTripped[0]).toBe(0);
      expect(roundTripped[255]).toBe(255);
      expect(roundTripped[256]).toBe(0);
      expect(roundTripped[99_999]).toBe(99_999 % 256);
    });
  });

  describe('file parts', () => {
    it('round-trips a file part', () => {
      const fileData = new Uint8Array(Buffer.from('%PDF-1.4 fake content'));
      const result: FileTransformResult = {
        metadata: { format: 'pdf' },
        parts: [
          {
            type: 'file',
            data: fileData,
            mediaType: 'application/pdf',
            filename: 'report.pdf',
          } satisfies FilePart,
        ],
      };

      const out = roundTrip(result);
      expect(out).not.toBeNull();
      const part = out!.parts[0] as FilePart;
      expect(part.type).toBe('file');
      expect(part.mediaType).toBe('application/pdf');
      expect(part.filename).toBe('report.pdf');
      expect(Buffer.from(part.data as Uint8Array).toString()).toBe(
        '%PDF-1.4 fake content',
      );
    });

    it('handles file part without filename', () => {
      const result: FileTransformResult = {
        metadata: {},
        parts: [
          {
            type: 'file',
            data: new Uint8Array([0xde, 0xad]),
            mediaType: 'application/octet-stream',
          } satisfies FilePart,
        ],
      };

      const out = roundTrip(result);
      const part = out!.parts[0] as FilePart;
      expect(part.filename).toBeUndefined();
      expect(new Uint8Array(part.data as Uint8Array)).toEqual(
        new Uint8Array([0xde, 0xad]),
      );
    });
  });

  describe('mixed parts', () => {
    it('round-trips text + image + file in order', () => {
      const result: FileTransformResult = {
        metadata: { size: '10KB', modified: '2025-01-01T00:00:00Z' },
        parts: [
          { type: 'text', text: 'opening tag content' },
          {
            type: 'image',
            image: new Uint8Array([10, 20, 30]),
            mediaType: 'image/webp',
          } satisfies ImagePart,
          {
            type: 'file',
            data: new Uint8Array([40, 50]),
            mediaType: 'application/pdf',
            filename: 'doc.pdf',
          } satisfies FilePart,
          { type: 'text', text: 'closing tag content' },
        ],
      };

      const out = roundTrip(result);
      expect(out!.parts).toHaveLength(4);
      expect(out!.parts[0].type).toBe('text');
      expect(out!.parts[1].type).toBe('image');
      expect(out!.parts[2].type).toBe('file');
      expect(out!.parts[3].type).toBe('text');
      expect(out!.metadata).toEqual(result.metadata);
    });
  });

  describe('empty and edge cases', () => {
    it('handles empty parts array', () => {
      const result: FileTransformResult = {
        metadata: { error: 'true' },
        parts: [],
      };
      const out = roundTrip(result);
      expect(out!.parts).toEqual([]);
      expect(out!.metadata).toEqual({ error: 'true' });
    });

    it('handles empty metadata', () => {
      const result: FileTransformResult = {
        metadata: {},
        parts: [{ type: 'text', text: 'hello' }],
      };
      const out = roundTrip(result);
      expect(out!.metadata).toEqual({});
    });
  });

  describe('deserialization error handling', () => {
    it('returns null for invalid JSON', () => {
      expect(deserializeTransformResult('not json')).toBeNull();
    });

    it('returns null for JSON without parts array', () => {
      expect(
        deserializeTransformResult(JSON.stringify({ metadata: {} })),
      ).toBeNull();
    });

    it('returns null for JSON with non-array parts', () => {
      expect(
        deserializeTransformResult(
          JSON.stringify({ metadata: {}, parts: 'not an array' }),
        ),
      ).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(deserializeTransformResult('')).toBeNull();
    });

    it('handles missing metadata gracefully (defaults to {})', () => {
      const json = JSON.stringify({
        parts: [{ type: 'text', text: 'hello' }],
      });
      const out = deserializeTransformResult(json);
      expect(out).not.toBeNull();
      expect(out!.metadata).toEqual({});
    });
  });
});
