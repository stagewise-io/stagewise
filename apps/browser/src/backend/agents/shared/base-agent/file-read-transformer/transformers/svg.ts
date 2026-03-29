/**
 * SVG transformer.
 *
 * Returns the SVG source as a `TextPart`. SVGs are XML text and should
 * not be sent as `ImagePart` (models benefit from seeing the markup).
 *
 * Supports:
 *   - `startLine` / `endLine` — slice output to a specific line range
 *   - `preview` — return the first PREVIEW_LINES lines with a
 *     truncation indicator and total line count
 */

import type {
  FileTransformer,
  FileTransformResult,
  ReadParams,
} from '../types';
import {
  baseMetadata,
  prefixLineNumbers,
  getMaxPreviewLines,
  isBinaryBuffer,
  truncateTextContent,
} from '../format-utils';

export const svgTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  // Guard: if the buffer is actually binary despite the .svg extension,
  // fall back to the text transformer which handles binary gracefully.
  if (isBinaryBuffer(buf)) {
    const { textTransformer } = await import('./text');
    return textTransformer(buf, mountedPath, stats, ctx, originalFileName);
  }

  const metadata: Record<string, string> = {
    ...baseMetadata(stats.size, stats.mtime),
    format: 'svg',
    language: 'xml',
  };

  const text = buf.toString('utf-8');
  const allLines = text.split('\n');
  const totalLines = allLines.length;
  metadata.lines = String(totalLines);
  metadata.chars = String(text.length);

  const { preview } = ctx.readParams;

  // ── Preview mode ─────────────────────────────────────────────────
  if (preview) {
    const maxPreview = getMaxPreviewLines();
    const previewEnd = Math.min(maxPreview, totalLines);
    const slice = allLines.slice(0, previewEnd);
    let output = prefixLineNumbers(slice.join('\n'), 1);

    if (totalLines > previewEnd) {
      output += `\n… (${totalLines - previewEnd} more lines)`;
    }

    metadata.preview = 'true';

    const effectiveReadParams: ReadParams = {
      preview: true,
      startLine: 1,
      endLine: previewEnd,
    };

    return {
      metadata,
      parts: [{ type: 'text', text: output }],
      effectiveReadParams,
    };
  }

  // ── Line-range and full content (via shared helper) ───────────────
  const { output, effectiveReadParams } = truncateTextContent(
    allLines,
    ctx.readParams,
  );

  return {
    metadata,
    parts: [{ type: 'text', text: output }],
    effectiveReadParams,
  };
};
