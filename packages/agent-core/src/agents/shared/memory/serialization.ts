import type { UITools } from 'ai';
import type { AgentMessage } from '../../../types/agent';

export type WideAgentMessage = AgentMessage<UITools, any>;

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface SerializedMemoryHistory {
  markdown: string;
  jsonl: string;
}

export interface SerializeAgentMemoryOptions {
  agentInstanceId: string;
  title?: string;
  serializedAt?: Date;
  sequenceOffset?: number;
}

const CHUNK_SIZE = 100;

function formatDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function jsonReplacer() {
  const ancestors: object[] = [];
  return function replacer(
    this: unknown,
    _key: string,
    value: unknown,
  ): JsonValue | undefined {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack ?? null,
      };
    }
    if (value instanceof Map) return Object.fromEntries(value.entries());
    if (value instanceof Set) return [...value.values()] as JsonValue[];
    if (typeof value === 'object' && value !== null) {
      while (ancestors.length > 0 && ancestors.at(-1) !== (this as object)) {
        ancestors.pop();
      }
      if (ancestors.includes(value)) return '[Circular]';
      ancestors.push(value);
    }
    return value as JsonValue | undefined;
  };
}

export function stringifyMemoryJson(value: unknown, space?: number): string {
  return JSON.stringify(value, jsonReplacer(), space);
}

function fencedJson(value: unknown): string {
  const json = stringifyMemoryJson(value, 2) ?? 'null';
  return ['```json', json, '```'].join('\n');
}

function renderPart(part: Record<string, unknown>, index: number): string {
  const lines: string[] = [
    `### Part ${index + 1}: ${String(part.type ?? 'unknown')}`,
  ];
  if (typeof part.text === 'string') {
    lines.push('', part.text);
  }

  if (String(part.type ?? '').startsWith('tool-')) {
    const keys = [
      'toolCallId',
      'state',
      'input',
      'output',
      'errorText',
      'providerExecuted',
      'preliminary',
      'approval',
    ];
    const payload: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in part) payload[key] = part[key];
    }
    lines.push('', fencedJson(payload));
  } else if (typeof part.text !== 'string') {
    lines.push('', fencedJson(part));
  }
  return lines.join('\n');
}

function getMetadata(message: WideAgentMessage): Record<string, unknown> {
  const metadata = (message as { metadata?: unknown }).metadata;
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function renderMetadata(metadata: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const compressedHistory = metadata.compressedHistory;
  if (typeof compressedHistory === 'string' && compressedHistory.length > 0) {
    lines.push('### Compressed history annotation', '', compressedHistory, '');
  }

  const selected: Record<string, unknown> = {};
  for (const key of [
    'attachments',
    'textClipAttachments',
    'mentions',
    'pathReferences',
    'partsMetadata',
  ]) {
    if (key in metadata) selected[key] = metadata[key];
  }
  if (Object.keys(selected).length > 0) {
    lines.push('### Metadata', '', fencedJson(selected), '');
  }
  return lines;
}

export function renderMemoryMarkdownHeader(agentInstanceId: string): string {
  return ['# Agent Memory', '', `Agent instance: ${agentInstanceId}`, ''].join(
    '\n',
  );
}

function renderMessageMarkdown(
  message: WideAgentMessage,
  sequence: number,
): string[] {
  const metadata = getMetadata(message);
  const createdAt = formatDate(metadata.createdAt);
  const lines = [
    `## Message ${sequence}: ${message.role}`,
    '',
    `- id: ${message.id}`,
    `- role: ${message.role}`,
  ];
  if (createdAt) lines.push(`- createdAt: ${createdAt}`);
  lines.push('');

  const parts = Array.isArray(message.parts) ? message.parts : [];
  if (parts.length === 0) {
    lines.push('_No parts._', '');
  } else {
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      lines.push(
        renderPart(parts[partIndex] as Record<string, unknown>, partIndex),
        '',
      );
    }
  }
  lines.push(...renderMetadata(metadata));
  return lines;
}

function normalizeMarkdown(lines: readonly string[]): string {
  return `${lines
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trimEnd()}\n`;
}

export function serializeAgentMemoryMarkdownSlice(
  history: readonly WideAgentMessage[],
  options: SerializeAgentMemoryOptions,
): string {
  const lines: string[] = [];
  const sequenceOffset = options.sequenceOffset ?? 0;

  history.forEach((message, index) => {
    lines.push(...renderMessageMarkdown(message, sequenceOffset + index + 1));
  });

  return normalizeMarkdown(lines);
}

export function serializeAgentMemoryJsonl(
  history: readonly WideAgentMessage[],
  options: SerializeAgentMemoryOptions,
): string {
  const serializedAt = (options.serializedAt ?? new Date()).toISOString();
  const sequenceOffset = options.sequenceOffset ?? 0;
  return (
    history
      .map((message, index) =>
        stringifyMemoryJson({
          sequence: sequenceOffset + index + 1,
          serializedAt,
          agentInstanceId: options.agentInstanceId,
          message,
        }),
      )
      .join('\n') + (history.length > 0 ? '\n' : '')
  );
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export async function serializeAgentMemoryHistoryChunked(
  history: readonly WideAgentMessage[],
  options: SerializeAgentMemoryOptions,
): Promise<SerializedMemoryHistory> {
  const serializedAt = options.serializedAt ?? new Date();
  const sequenceOffset = options.sequenceOffset ?? 0;
  const markdownLines: string[] = [
    renderMemoryMarkdownHeader(options.agentInstanceId),
  ];
  const jsonlLines: string[] = [];

  for (let index = 0; index < history.length; index++) {
    const message = history[index];
    if (!message) continue;
    const sequence = sequenceOffset + index + 1;
    markdownLines.push(...renderMessageMarkdown(message, sequence));
    jsonlLines.push(
      stringifyMemoryJson({
        sequence,
        serializedAt: serializedAt.toISOString(),
        agentInstanceId: options.agentInstanceId,
        message,
      }) ?? 'null',
    );

    if ((index + 1) % CHUNK_SIZE === 0) await yieldToEventLoop();
  }

  return {
    markdown: normalizeMarkdown(markdownLines),
    jsonl: `${jsonlLines.join('\n')}${jsonlLines.length > 0 ? '\n' : ''}`,
  };
}
