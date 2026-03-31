/**
 * Text fallback transformer.
 *
 * Attempts UTF-8 decode. If the buffer round-trips cleanly, returns the
 * content as a `TextPart` with language and line-count metadata.
 * Each line is prefixed with its 1-indexed line number and a vertical bar
 * (e.g. `1|`, `2|`, …) so the model can reference exact locations.
 * Otherwise returns a binary-placeholder message.
 *
 * This is the default transformer for all extensions that don't have a
 * more specific handler (code, config files, unknown extensions, etc.).
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
  inferLanguage,
  prefixLineNumbers,
  isBinaryBuffer,
  truncateTextContent,
} from '../format-utils';

export const textTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  const metadata = baseMetadata(stats.size, stats.mtime);

  // Determine extension for language inference.
  const nameForExt = originalFileName ?? mountedPath;
  const ext = nodePath.extname(nameForExt).toLowerCase();

  // Check if content is valid UTF-8 text.
  if (!isBinaryBuffer(buf)) {
    const text = buf.toString('utf-8');
    const allLines = text.split('\n');
    const totalLines = allLines.length;
    const language = inferLanguage(ext);
    if (language) metadata.language = language;
    metadata.lines = String(totalLines);
    metadata.chars = String(text.length);

    const { preview } = ctx.readParams;

    // ── Preview mode ─────────────────────────────────────────────
    if (preview) {
      const maxPreview = ctx.maxPreviewLines;
      const previewEnd = Math.min(maxPreview, totalLines);
      const slice = allLines.slice(0, previewEnd);
      let numbered = prefixLineNumbers(slice.join('\n'), 1);

      if (totalLines > previewEnd) {
        numbered += `\n… (${totalLines - previewEnd} more lines)`;
      }

      metadata.preview = 'true';

      const effectiveReadParams: ReadParams = {
        preview: true,
        startLine: 1,
        endLine: previewEnd,
      };

      return {
        metadata,
        parts: [{ type: 'text', text: numbered }],
        effectiveReadParams,
      };
    }

    // ── Line-range and full content (via shared helper) ──────────
    const { output, effectiveReadParams } = truncateTextContent(
      allLines,
      ctx.readParams,
      ctx.maxReadChars,
    );

    return {
      metadata,
      parts: [{ type: 'text', text: output }],
      effectiveReadParams,
    };
  }

  // Binary file — can't inline (no line-number prefix for this message).
  return {
    metadata,
    parts: [
      {
        type: 'text',
        text: `Binary file — cannot be displayed inline. Use fs.readFile('${mountedPath}') in the sandbox to access raw bytes.`,
      },
    ],
  };
};
