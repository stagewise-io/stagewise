/**
 * Utilities for extracting and populating `pathReferences` on message metadata.
 *
 * `pathReferences` is a `Record<path, sha256Hash>` that tracks which files
 * were referenced in a message and their content state at execution time.
 *
 * - **User messages**: paths are extracted from `[...](path:...)` markdown links.
 * - **Assistant messages**: paths are extracted from completed `readFile` tool calls.
 */

import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { ReadParams } from './types';

// ---------------------------------------------------------------------------
// Path link extraction
// ---------------------------------------------------------------------------

/**
 * Regex matching `[optional label](path:id)` markdown links.
 *
 * Mirrors the UI-side regex in `tiptap-content-utils.ts` but only captures
 * `path:` protocol links (not `tab:` or `mention:`).
 *
 * The path value may contain nested parentheses (e.g. glob patterns) so the
 * capture group allows one level of balanced parens.
 */
const PATH_LINK_RE = /\[[^\]]*\]\(path:((?:[^()]|\([^()]*\))+)\)/g;

/**
 * Extracts all unique mount-prefixed paths from `path:` markdown links
 * found in the text parts of a message.
 *
 * Query parameters (e.g. `?display=expanded`) are stripped from the path.
 *
 * @returns Deduplicated array of clean paths (e.g. `["w1/src/app.tsx", "att/image_abc.png"]`).
 */
export function extractPathLinksFromMessage(message: AgentMessage): string[] {
  const paths = new Set<string>();

  for (const part of message.parts) {
    if (part.type !== 'text') continue;

    const re = new RegExp(PATH_LINK_RE.source, 'g');
    for (
      let match = re.exec(part.text);
      match !== null;
      match = re.exec(part.text)
    ) {
      const rawPath = match[1]!;
      // Strip query parameters
      const qIdx = rawPath.indexOf('?');
      const cleanPath = qIdx >= 0 ? rawPath.slice(0, qIdx) : rawPath;
      if (cleanPath.length > 0) {
        paths.add(cleanPath);
      }
    }
  }

  return [...paths];
}

// ---------------------------------------------------------------------------
// readFile tool-call path extraction
// ---------------------------------------------------------------------------

/**
 * Extracts all unique file paths from completed `readFile` tool-call parts
 * on an assistant message.
 *
 * Only considers parts that have successfully completed (`output-available`) —
 * pending, in-progress, and failed (`output-error`) calls are ignored.
 *
 * @returns Deduplicated array of mount-prefixed paths.
 */
export function extractReadFilePathsFromAssistantMessage(
  message: AgentMessage,
): string[] {
  if (message.role !== 'assistant') return [];

  const paths = new Set<string>();

  for (const part of message.parts) {
    if (part.type !== 'tool-read') continue;
    if (!('input' in part) || !part.input) continue;

    // Only extract from successfully completed tool calls
    const state = 'state' in part ? part.state : undefined;
    if (state !== 'output-available') continue;

    const relativePath = part.input.path;
    if (typeof relativePath === 'string' && relativePath.length > 0) {
      paths.add(relativePath);
    }
  }

  return [...paths];
}

/**
 * Represents a single read-file request with its path and read params.
 *
 * Multiple entries can share the same path when the agent reads
 * different ranges of the same file within one assistant turn.
 */
export interface ReadFileRequest {
  path: string;
  readParams: ReadParams;
}

/**
 * Extracts per-call read params from completed `readFile` tool-call parts
 * on an assistant message.
 *
 * Unlike `extractReadFilePathsFromAssistantMessage` (which deduplicates
 * by path), this function returns **one entry per tool call** so that
 * different line/page ranges for the same file are preserved.
 *
 * Only considers parts that have successfully completed (`output-available`).
 *
 * @returns Array of `{ path, readParams }` — one per completed tool call.
 */
export function extractReadFileRequestsFromAssistantMessage(
  message: AgentMessage,
): ReadFileRequest[] {
  if (message.role !== 'assistant') return [];

  const requests: ReadFileRequest[] = [];

  for (const part of message.parts) {
    if (part.type !== 'tool-read') continue;
    if (!('input' in part) || !part.input) continue;

    const state = 'state' in part ? part.state : undefined;
    if (state !== 'output-available') continue;

    const input = part.input as {
      path?: string;
      start_line?: number;
      end_line?: number;
      start_page?: number;
      end_page?: number;
      preview?: boolean;
    };

    const relativePath = input.path;
    if (typeof relativePath !== 'string' || relativePath.length === 0) continue;

    const readParams: ReadParams = {};
    if (input.start_line !== undefined) readParams.startLine = input.start_line;
    if (input.end_line !== undefined) readParams.endLine = input.end_line;
    if (input.start_page !== undefined) readParams.startPage = input.start_page;
    if (input.end_page !== undefined) readParams.endPage = input.end_page;
    if (input.preview) readParams.preview = true;

    requests.push({ path: relativePath, readParams });
  }

  return requests;
}
