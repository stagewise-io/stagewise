/**
 * Text-blob transformer.
 *
 * Handles `.textclip` and `.swdomelement` blobs — structured text
 * captured from the browser (copied text, selected DOM elements).
 *
 * Returns the raw UTF-8 content as a `TextPart`.
 *
 * Supports:
 *   - `startLine` / `endLine` — slice output to a specific line range
 *   - `preview` — return the first PREVIEW_LINES lines with a
 *     truncation indicator and total line count
 */

import nodePath from 'node:path';
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

/** Known blob extensions → human-readable type name. */
const BLOB_TYPES: Record<string, string> = {
  '.textclip': 'text-clip',
  '.swdomelement': 'dom-element',
};

export const textBlobTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  // Guard: if the buffer is actually binary, fall back to the text
  // transformer which handles binary detection gracefully.
  if (isBinaryBuffer(buf)) {
    const { textTransformer } = await import('./text');
    return textTransformer(buf, mountedPath, stats, ctx, originalFileName);
  }

  const nameForExt = originalFileName ?? mountedPath;
  const ext = nodePath.extname(nameForExt).toLowerCase();

  const metadata: Record<string, string> = {
    ...baseMetadata(stats.size, stats.mtime),
    type: BLOB_TYPES[ext] ?? 'text-blob',
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
