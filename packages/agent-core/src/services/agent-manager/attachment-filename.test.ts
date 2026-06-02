import { describe, it, expect } from 'vitest';
import { generateAttachmentFilename } from './attachment-filename';

function stripRandomSuffix(filename: string): string {
  const lastUnderscoreIdx = filename.lastIndexOf('_');
  if (lastUnderscoreIdx === -1) return filename;
  const dotIdx = filename.indexOf('.', lastUnderscoreIdx);
  return dotIdx === -1
    ? filename.slice(0, lastUnderscoreIdx)
    : `${filename.slice(0, lastUnderscoreIdx)}${filename.slice(dotIdx)}`;
}

describe('generateAttachmentFilename (agent-core)', () => {
  it('produces a string', () => {
    expect(typeof generateAttachmentFilename('test.png')).toBe('string');
  });

  it('preserves a clean extension lowercased', () => {
    expect(generateAttachmentFilename('Image.PNG')).toMatch(/\.png$/);
    expect(generateAttachmentFilename('photo.JPG')).toMatch(/\.jpg$/);
  });

  it('falls back to "file" prefix for unicode-only names', () => {
    const result = generateAttachmentFilename('数据.csv');
    expect(result).toMatch(/^file_/);
    expect(result).toMatch(/\.csv$/);
  });

  it('handles files with no extension', () => {
    const result = generateAttachmentFilename('Makefile');
    expect(result).not.toContain('.');
    expect(result).toMatch(/^makefile_/);
  });

  it('strips path separators from a traversal-style extension', () => {
    const result = generateAttachmentFilename('image.svg/../../secret');
    expect(result).not.toContain('/');
    expect(result).not.toContain('..');
    expect(result).not.toMatch(/\.{2,}/);
  });

  it('strips backslashes and dots from a windows-style traversal extension', () => {
    const result = generateAttachmentFilename('name.\\..\\etc\\passwd');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('/');
    expect(result).not.toMatch(/\.{2,}/);
  });

  it('strips whitespace from extensions', () => {
    const result = generateAttachmentFilename('image. png');
    expect(result).toMatch(/\.png$/);
  });

  it('produces unique IDs on repeated calls', () => {
    const ids = new Set(
      Array.from({ length: 20 }, () => generateAttachmentFilename('test.png')),
    );
    expect(ids.size).toBe(20);
  });

  it('handles filename that is only an extension dot', () => {
    const result = generateAttachmentFilename('.env');
    expect(result).not.toMatch(/^\./);
  });

  it('truncates prefix to 10 characters and uses the cleaned suffix', () => {
    const result = generateAttachmentFilename('averylongfilename.ts');
    const stripped = stripRandomSuffix(result).replace(/\.ts$/, '');
    expect(stripped.length).toBeLessThanOrEqual(10);
  });
});
