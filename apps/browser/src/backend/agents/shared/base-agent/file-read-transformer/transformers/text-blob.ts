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
  getMaxReadLines,
  getMaxPreviewLines,
  isBinaryBuffer,
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
