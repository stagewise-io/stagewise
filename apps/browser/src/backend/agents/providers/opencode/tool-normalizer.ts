import type { ToolCall, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { parsePatch } from 'diff';

type ToolState = ToolCall | ToolCallUpdate;

export function normalizeOpenCodeTool(tool: ToolState): ToolState {
  if (
    tool.kind !== 'edit' ||
    tool.content?.some((content) => content.type === 'diff')
  ) {
    return tool;
  }

  const output = tool.rawOutput as
    | { metadata?: { files?: unknown } }
    | undefined;
  const diffs = Array.isArray(output?.metadata?.files)
    ? output.metadata.files.flatMap(fileDiff)
    : [];
  return diffs.length
    ? { ...tool, content: [...(tool.content ?? []), ...diffs] }
    : tool;
}

function fileDiff(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const { filePath, patch, type } = value as Record<string, unknown>;
  if (typeof filePath !== 'string' || typeof patch !== 'string') return [];

  try {
    return parsePatch(patch).flatMap((entry) =>
      entry.hunks.map((hunk) => ({
        type: 'diff' as const,
        path: filePath,
        oldText: type === 'add' ? null : hunkSide(hunk.lines, '+'),
        newText: hunkSide(hunk.lines, '-'),
      })),
    );
  } catch {
    return [];
  }
}

function hunkSide(lines: string[], excluded: '+' | '-'): string {
  const text = lines.flatMap((line) =>
    line.startsWith(excluded) || line.startsWith('\\') ? [] : [line.slice(1)],
  );
  return text.length ? `${text.join('\n')}\n` : '';
}
