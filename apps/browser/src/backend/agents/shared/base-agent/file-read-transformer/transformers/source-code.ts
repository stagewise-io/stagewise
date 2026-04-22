/**
 * Source-code transformer.
 *
 * Handles source files for which a Tree-sitter grammar is available
 * (TypeScript, Python, Go, Rust, Java, C/C++, Ruby, PHP, C#, CSS,
 * Shell/Bash, etc.).
 *
 * Behaviour:
 *   - `preview: true` → AST-based symbol outline (`<outline>…</outline>`).
 *     Falls back to line-based preview when parsing fails or yields
 *     zero symbols.
 *   - `startLine` / `endLine` → line-range slice via `truncateTextContent`.
 *   - Full read (no params) → full text via `truncateTextContent`.
 *
 * Binary files are delegated to `textTransformer`.
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
import { getFileSymbols, type SymbolInfo } from '../ast';

// ---------------------------------------------------------------------------
// Outline formatting
// ---------------------------------------------------------------------------

/**
 * Tagged outline entry produced during the full render pass.
 */
interface OutlineEntry {
  text: string;
  depth: number;
  /** Character cost including the trailing newline. */
  cost: number;
}

/**
 * Render a `SymbolInfo[]` tree as a compact outline string.
 *
 * Strategy: render the complete tree first, then prune the deepest
 * nesting levels until the output fits within `maxChars`. This
 * guarantees all top-level symbols remain visible before any nested
 * detail, giving the model a broad file map rather than a deep dump
 * of only the first symbol.
 *
 * When pruning occurs a truncation notice is appended so the model
 * knows the outline is incomplete.
 */
function formatSymbolOutline(symbols: SymbolInfo[], maxChars: number): string {
  if (symbols.length === 0) return '';

  // ── 1. Full depth-first render (no budget check) ──────────────────
  const entries: OutlineEntry[] = [];
  let maxDepthSeen = 0;

  function renderSymbol(sym: SymbolInfo, depth: number): void {
    const indent = '  '.repeat(depth);

    const display = sym.signature || `${sym.kind} ${sym.name}`;

    const text = `${indent}${display} (line ${sym.line + 1})`;
    entries.push({ text, depth, cost: text.length + 1 });
    if (depth > maxDepthSeen) maxDepthSeen = depth;

    if (sym.children) {
      for (const child of sym.children) {
        renderSymbol(child, depth + 1);
      }
    }
  }

  for (const sym of symbols) {
    renderSymbol(sym, 1);
  }

  // ── 2. Prune deepest levels until budget fits ─────────────────────
  let kept = entries;
  let totalCost = kept.reduce((sum, e) => sum + e.cost, 0);
  let depthPruned = false;

  while (totalCost > maxChars && maxDepthSeen > 1) {
    kept = kept.filter((e) => e.depth < maxDepthSeen);
    totalCost = kept.reduce((sum, e) => sum + e.cost, 0);
    maxDepthSeen--;
    depthPruned = true;
  }

  // ── 3. Hard cutoff if depth-1-only still overflows ────────────────
  let hardCutoffCount = 0;
  if (totalCost > maxChars && kept.length > 1) {
    let budget = maxChars;
    let cutIdx = kept.length;
    for (let i = 0; i < kept.length; i++) {
      budget -= kept[i].cost;
      if (budget < 0) {
        cutIdx = i;
        break;
      }
    }
    hardCutoffCount = kept.length - cutIdx;
    kept = kept.slice(0, cutIdx);
  }

  // ── 4. Build outline string with truncation notice ────────────────
  const body = kept.map((e) => e.text).join('\n');
  const notices: string[] = [];

  if (depthPruned) {
    notices.push(
      '  … (outline truncated — deeper members omitted to fit budget)',
    );
  }
  if (hardCutoffCount > 0) {
    notices.push(`  … (${hardCutoffCount} more top-level symbols not shown)`);
  }

  const suffix = notices.length > 0 ? `\n${notices.join('\n')}` : '';
  return `<outline>\n${body}${suffix}\n</outline>`;
}

// ---------------------------------------------------------------------------
// Line-based preview fallback (mirrors textTransformer preview logic)
// ---------------------------------------------------------------------------

function lineBasedPreview(
  allLines: readonly string[],
  totalLines: number,
  maxPreviewLines: number,
): { output: string; effectiveReadParams: ReadParams } {
  const previewEnd = Math.min(maxPreviewLines, totalLines);
  const slice = allLines.slice(0, previewEnd);
  let numbered = prefixLineNumbers(slice.join('\n'), 1);

  if (totalLines > previewEnd) {
    numbered += `\n… (${totalLines - previewEnd} more lines)`;
  }

  return {
    output: numbered,
    effectiveReadParams: {
      preview: true,
      startLine: 1,
      endLine: previewEnd,
    },
  };
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export const sourceCodeTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  // Guard: if the buffer is actually binary despite the source extension,
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

  const { preview } = ctx.readParams;

  // ── Preview mode — AST-based symbol outline ──────────────────────
  if (preview) {
    metadata.preview = 'true';

    try {
      // Strip leading dot for the AST module (expects 'ts', not '.ts').
      const extNoDot = ext.startsWith('.') ? ext.slice(1) : ext;
      const parsed = await getFileSymbols(text, extNoDot);

      if (parsed && parsed.symbols.length > 0) {
        metadata.format = 'source-outline';

        const outline = formatSymbolOutline(parsed.symbols, ctx.maxReadChars);

        const effectiveReadParams: ReadParams = {
          preview: true,
        };

        return {
          metadata,
          parts: [{ type: 'text', text: outline }],
          effectiveReadParams,
        };
      }
    } catch {
      // AST parsing failed — fall through to line-based preview.
    }

    // Fallback: line-based preview (same as textTransformer).
    const { output, effectiveReadParams } = lineBasedPreview(
      allLines,
      totalLines,
      ctx.maxPreviewLines,
    );

    return {
      metadata,
      parts: [{ type: 'text', text: output }],
      effectiveReadParams,
    };
  }

  // ── Line-range and full content (via shared helper) ────────────────
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
};
