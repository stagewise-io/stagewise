/**
 * Markdown transformer.
 *
 * Handles `.md` and `.mdx` files. Behaves like the text transformer
 * for full and line-range reads (line-numbered UTF-8 text), but
 * provides a **structured preview** that extracts headings with their
 * line ranges so the model can navigate the document efficiently.
 *
 * Supports:
 *   - `startLine` / `endLine` — slice output to a specific line range
 *   - `preview` — return a structural outline of headings with line
 *     numbers, plus the first few lines of content
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
  getMaxReadLines,
  isBinaryBuffer,
} from '../format-utils';

/** Maximum lines of raw content to include alongside the outline in preview. */
const PREVIEW_CONTENT_LINES = 15;

// ---------------------------------------------------------------------------
// Heading extraction
// ---------------------------------------------------------------------------

interface MarkdownSection {
  /** Heading level (1–6). */
  level: number;
  /** Heading text (without the `#` prefix). */
  title: string;
  /** 1-indexed line number where the heading appears. */
  startLine: number;
  /**
   * 1-indexed line number of the last line belonging to this section
   * (i.e. the line before the next heading of same or higher level,
   * or EOF).
   */
  endLine: number;
}

/**
 * Extract ATX-style headings (`# …`, `## …`, …) from markdown lines.
 *
 * Returns sections with start/end line ranges computed so that each
 * section spans from its heading to just before the next heading of
 * equal or higher level (or EOF).
 */
function extractSections(allLines: string[]): MarkdownSection[] {
  const headings: { level: number; title: string; line: number }[] = [];

  for (let i = 0; i < allLines.length; i++) {
    const match = allLines[i].match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        line: i + 1, // 1-indexed
      });
    }
  }

  if (headings.length === 0) return [];

  const sections: MarkdownSection[] = [];
  const totalLines = allLines.length;

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    // End line: just before the next heading of same-or-higher level, or EOF.
    let endLine = totalLines;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= current.level) {
        endLine = headings[j].line - 1;
        break;
      }
    }

    sections.push({
      level: current.level,
      title: current.title,
      startLine: current.line,
      endLine,
    });
  }

  return sections;
}

/**
 * Format sections as a compact outline string.
 *
 * Example:
 * ```
 * <outline>
 *   # Introduction [lines 1–24]
 *   ## Getting Started [lines 25–50]
 *   ### Installation [lines 25–35]
 *   ### Configuration [lines 36–50]
 *   # API Reference [lines 51–200]
 * </outline>
 * ```
 */
function formatOutline(sections: MarkdownSection[]): string {
  if (sections.length === 0) return '';

  const lines = sections.map((s) => {
    const indent = '  '.repeat(s.level - 1);
    const hashes = '#'.repeat(s.level);
    return `${indent}${hashes} ${s.title} [lines ${s.startLine}–${s.endLine}]`;
  });

  return `<outline>\n${lines.join('\n')}\n</outline>`;
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export const markdownTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  // Guard: if the buffer is actually binary despite the .md/.mdx extension,
  // fall back to the text transformer which handles binary gracefully.
  if (isBinaryBuffer(buf)) {
    const { textTransformer } = await import('./text');
    return textTransformer(buf, mountedPath, stats, ctx, originalFileName);
  }

  const metadata = baseMetadata(stats.size, stats.mtime);

  const nameForExt = originalFileName ?? mountedPath;
  const ext = nodePath.extname(nameForExt).toLowerCase();

  const text = buf.toString('utf-8');
  const allLines = text.split('\n');
  const totalLines = allLines.length;

  const language = inferLanguage(ext);
  if (language) metadata.language = language;
  metadata.lines = String(totalLines);
  metadata.chars = String(text.length);
  metadata.format = 'markdown';

  const { startLine, endLine, preview } = ctx.readParams;

  // ── Preview mode — structured outline ──────────────────────────────
  if (preview) {
    metadata.preview = 'true';

    const sections = extractSections(allLines);
    const outline = formatOutline(sections);

    // Include a few lines of content so the model sees the opening.
    const previewEnd = Math.min(PREVIEW_CONTENT_LINES, totalLines);
    const contentSlice = allLines.slice(0, previewEnd);
    let numbered = prefixLineNumbers(contentSlice.join('\n'), 1);

    if (totalLines > previewEnd) {
      numbered += `\n… (${totalLines - previewEnd} more lines)`;
    }

    // Combine outline + content preview.
    let output = '';
    if (outline) {
      output += `${outline}\n\n`;
    }
    output += numbered;

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

  // ── Line-range slicing ─────────────────────────────────────────────
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

  // ── Full content (capped) ──────────────────────────────────────────
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

  return { metadata, parts: [{ type: 'text', text: numbered }] };
};
