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
  getMaxReadLines,
  getMaxPreviewLines,
  isBinaryBuffer,
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

  const { startLine, endLine, preview } = ctx.readParams;

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

  // ── Line-range slicing ───────────────────────────────────────────
  if (startLine !== undefined || endLine !== undefined) {
    const maxLines = getMaxReadLines();
    const sl = Math.max(1, startLine ?? 1);
    const requestedEnd = Math.min(totalLines, endLine ?? totalLines);
    const el = Math.min(requestedEnd, sl + maxLines - 1);
    const truncated = el < requestedEnd;
    const slice = allLines.slice(sl - 1, el);
    let numbered = prefixLineNumbers(slice.join('\n'), sl);

    if (truncated) {
      numbered += `\n… (truncated at ${maxLines} lines, ${requestedEnd - el} more lines until line ${requestedEnd})`;
    }

    const effectiveReadParams: ReadParams = {
      startLine: sl,
      endLine: el,
    };

    return {
      metadata,
      parts: [{ type: 'text', text: numbered }],
      effectiveReadParams,
    };
  }

  // ── Full content (capped) ────────────────────────────────────────
  const maxLines = getMaxReadLines();
  const cappedEnd = Math.min(totalLines, maxLines);
  const truncated = cappedEnd < totalLines;
  const outputLines = truncated ? allLines.slice(0, cappedEnd) : allLines;
  let numbered = prefixLineNumbers(outputLines.join('\n'));

  if (truncated) {
    numbered += `\n… (truncated at ${maxLines} lines, ${totalLines - cappedEnd} more lines remaining)`;
  }

  if (truncated) {
    return {
      metadata,
      parts: [{ type: 'text', text: numbered }],
      effectiveReadParams: { startLine: 1, endLine: cappedEnd },
    };
  }

  return {
    metadata,
    parts: [{ type: 'text', text: numbered }],
  };
};
