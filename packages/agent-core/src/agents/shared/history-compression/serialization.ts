import type { UITools } from 'ai';
import type { AgentMessage } from '../../../types/agent';
import type { AgentHost } from '../../../host/host';
import type { UserMessageMetadata } from '../../../types/metadata';

/**
 * Wide AgentMessage type that accepts any tool set and any metadata
 * shape.
 *
 * The core `AgentMessage` default generic is `UniversalTools` (the narrow
 * filesystem-only set) with the core `UserMessageMetadata`. Host-side
 * tool sets (browser, CLI, future hosts) extend this with additional
 * tools such as `executeShellCommand`, `askUserQuestions`, etc., and
 * may attach a wider metadata shape (extra mention provider types,
 * extra attachment fields). This serialiser runs against whatever tool
 * set and metadata shape the runtime produced, so we widen both
 * generics. Internal access goes through `Record<string, unknown>`
 * casts and `try/catch` blocks, so unknown metadata fields are handled
 * gracefully.
 */
type WideAgentMessage = AgentMessage<UITools, any>;
type WideAgentMessagePart = WideAgentMessage['parts'][number];

const escapeTextForXML = (text: string): string => {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const escapeSummaryValue = (value: unknown): string =>
  escapeTextForXML(String(value ?? ''));

// ─── Tool part → compact one-liner ─────────────────────────────────────────

// ─── Helpers for output-aware serialisation ────────────────────────────────

/**
 * Returns a short error suffix when a tool part is in an error/denied state.
 * Returns `undefined` when the tool completed normally.
 */
const getErrorSuffix = (part: WideAgentMessagePart): string | undefined => {
  if (!('state' in part)) return undefined;
  if (part.state === 'output-error') {
    const msg = ('errorText' in part && part.errorText) || 'unknown error';
    const firstLine = String(msg).split('\n')[0] ?? '';
    return ` ✗ ${escapeSummaryValue(firstLine.slice(0, 80))}`;
  }
  if (part.state === 'output-denied') return ' ✗ denied';
  return undefined;
};

/**
 * Serialises a tool-call part into a short, human-readable summary.
 * Returns `undefined` for tool types that are not worth surfacing.
 *
 * agent-core knows only the universal file-op tools shipped in core
 * (`read`, `write`, `multiEdit`, `copy`, `delete`, `glob`, `grepSearch`).
 * For any other `tool-*` part we consult `host.getToolPartSerializer(name)`
 * for a host-provided one-liner, then fall back to a generic
 * `[part.type + err]` marker so future tools are never silently lost.
 *
 * When the tool has completed (`output-available`), output data is used
 * to enrich the universal one-liners (e.g. write create-vs-update).
 * Error states are surfaced with a ✗ marker.
 */
const serializeToolPart = (
  part: WideAgentMessagePart,
  host: AgentHost | undefined,
): string | undefined => {
  if (!('input' in part) || !part.input) return undefined;

  const err = getErrorSuffix(part);
  // Tool inputs/outputs vary per tool. Since we narrow on `part.type`
  // below, casting through `unknown` to a permissive record here is safe
  // and avoids threading per-tool schemas through the core.
  const input = part.input as unknown as Record<string, unknown> & {
    [key: string]: any;
  };
  const output =
    'output' in part && part.state === 'output-available'
      ? (part.output as unknown as Record<string, unknown> & {
          [key: string]: any;
        })
      : undefined;

  switch (part.type) {
    case 'tool-read': {
      const path = escapeSummaryValue(input.path);
      if (err) return `[read: ${path}${err}]`;
      return `[read: ${path}]`;
    }

    case 'tool-multiEdit': {
      const path = escapeSummaryValue(input.path);
      if (err) return `[edited: ${path}${err}]`;
      return `[edited: ${path} (${Array.isArray(input.edits) ? input.edits.length : '?'} edits)]`;
    }

    case 'tool-write': {
      const path = escapeSummaryValue(input.path);
      if (err) return `[wrote: ${path}${err}]`;
      // Distinguish create vs update when output.message is available
      const owMsg = output?.message;
      if (typeof owMsg === 'string' && owMsg.includes('created'))
        return `[created: ${path}]`;
      return `[wrote: ${path}]`;
    }

    case 'tool-copy': {
      const action = input.move ? 'moved' : 'copied';
      const inputPath = escapeSummaryValue(input.input_path);
      const outputPath = escapeSummaryValue(input.output_path);
      return `[${action}: ${inputPath} → ${outputPath}${err ?? ''}]`;
    }

    case 'tool-delete':
      return `[deleted: ${escapeSummaryValue(input.path)}${err ?? ''}]`;

    case 'tool-grepSearch': {
      const query = escapeSummaryValue(input.query);
      const pattern = input.include_file_pattern
        ? ` in ${escapeSummaryValue(input.include_file_pattern)}`
        : '';
      if (err) return `[searched: "${query}"${err}]`;
      return `[searched: "${query}"${pattern}]`;
    }

    case 'tool-glob':
      return `[glob: ${escapeSummaryValue(input.pattern)}${err ?? ''}]`;

    default: {
      // Not a universal tool: try the host registry, then fall back.
      if (!part.type.startsWith('tool-')) return undefined;

      const bareName = part.type.slice('tool-'.length);
      const hostFn = host?.getToolPartSerializer(bareName);
      if (hostFn) {
        try {
          const rendered = hostFn({ input, output, err });
          if (typeof rendered === 'string' && rendered.length > 0) {
            return rendered;
          }
        } catch {
          // Broken host fn — fall through to the generic marker rather
          // than abort the whole compression pass.
        }
      }

      return `[${part.type}${err ?? ''}]`;
    }
  }
};

/**
 * Safely serialises a single part. If the part is malformed or throws,
 * returns a short fallback marker instead of propagating the error.
 */
const safeSerializePart = (
  part: WideAgentMessagePart,
  host: AgentHost | undefined,
): string | undefined => {
  try {
    if (part.type === 'text') {
      return escapeTextForXML(part.text);
    }
    return serializeToolPart(part, host);
  } catch {
    // Return a best-effort marker so the part isn't silently lost
    const tag = typeof part?.type === 'string' ? part.type : 'unknown';
    return `[${tag}: serialization-error]`;
  }
};

// ─── User message metadata annotations ─────────────────────────────────────

type MentionLike = {
  providerType: string;
  mountedPath?: string;
  fileName?: string;
  title?: string;
  name?: string;
};
type AttachmentLike = { path?: string; originalFileName?: string };

const serializeUserMetadataAnnotations = (
  metadata: WideAgentMessage['metadata'],
): string[] => {
  const annotations: string[] = [];
  if (!metadata) return annotations;

  try {
    // File / image attachments
    const attachments = (metadata as Record<string, unknown>).attachments as
      | AttachmentLike[]
      | undefined;
    if (Array.isArray(attachments) && attachments.length) {
      const names = attachments
        .filter((a) => a != null)
        .map((a) => a.originalFileName ?? a.path?.split('/').pop() ?? 'file');
      annotations.push(`[attached: ${names.join(', ')}]`);
    }

    // @-mentions (files, tabs, workspaces)
    const mentions = (metadata as Record<string, unknown>).mentions as
      | MentionLike[]
      | undefined;
    if (Array.isArray(mentions) && mentions.length) {
      const labels = mentions
        .filter((m) => m != null)
        .map((m) => {
          if (m.providerType === 'file')
            return m.mountedPath ?? m.fileName ?? 'file';
          if (m.providerType === 'tab') return m.title ?? 'tab';
          if (m.providerType === 'workspace') return m.name ?? 'workspace';
          return m.providerType ?? 'unknown';
        });
      annotations.push(`[mentioned: ${labels.join(', ')}]`);
    }
  } catch {
    // Metadata is best-effort — skip annotations rather than crash
  }

  return annotations;
};

/**
 * Estimates the token count for a single AgentMessage using a simple
 * character-based heuristic (chars / 4). This is intentionally imprecise —
 * it serves as a safety check to prevent context window overflow, not as a
 * billing calculation.
 *
 * Extraction per role:
 * - **user**: all text parts + metadata overhead (env-snapshot,
 *   annotations, text clips, mentions, selected elements)
 * - **assistant**: all text parts + tool-call names & JSON-stringified args
 * - **tool results**: tool name + stringified result/output
 *
 * Falls back to `JSON.stringify(part)` for unrecognised part types.
 */
export const estimateMessageTokens = (msg: WideAgentMessage): number => {
  if (!msg?.parts || !Array.isArray(msg.parts)) return 0;

  let totalChars = 0;

  for (const part of msg.parts) {
    try {
      if (part.type === 'text') totalChars += (part.text ?? '').length;
      else if ('toolName' in part && 'input' in part) {
        // Tool-call part (assistant side): name + serialised arguments
        totalChars += (part.toolName ?? '').length;
        totalChars += safeStringifyLength(part.input);
        // Include output if available (tool result embedded in the part)
        if ('output' in part && part.output !== undefined)
          totalChars += safeStringifyLength(part.output);

        // Unknown part type — conservative fallback
      } else totalChars += safeStringifyLength(part);
    } catch {
      // Skip malformed parts rather than crashing estimation
    }
  }

  // Account for metadata that the conversion pipeline injects into the
  // actual LLM prompt but that isn't visible in msg.parts: env-snapshot,
  // env-changes, text clips, mentions, selected elements, and compressed
  // history. Without this, the budget walk under-counts kept messages and
  // compression triggers too late.
  totalChars += estimateMetadataChars(msg.metadata);

  return Math.ceil(totalChars / 4);
};

/** JSON.stringify with a fallback length of 0 on failure. */
const safeStringifyLength = (value: unknown): number => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
};

/**
 * Flat per-message overhead for XML wrappers, role tags, and other
 * structural boilerplate injected by the conversion pipeline.
 */
const PER_MESSAGE_OVERHEAD_CHARS = 400;

/**
 * Estimates the character count of metadata fields that get injected into
 * the LLM prompt by the conversion pipeline but are not present in
 * `msg.parts`. Handles missing/malformed metadata gracefully.
 */
const estimateMetadataChars = (
  metadata: UserMessageMetadata | undefined,
): number => {
  if (!metadata) return PER_MESSAGE_OVERHEAD_CHARS;

  let chars = PER_MESSAGE_OVERHEAD_CHARS;

  try {
    // Per-domain env-state — every persisted `renderedState` /
    // `renderedStateChange` block contributes to the conversion
    // payload, so include them in the per-message char budget.
    if (metadata.envState) {
      for (const entry of Object.values(metadata.envState)) {
        if (entry?.renderedState) chars += entry.renderedState.length;
        if (entry?.renderedStateChange) {
          chars += entry.renderedStateChange.length;
        }
      }
    }

    // Compressed history on boundary messages
    if (metadata.compressedHistory) {
      chars += metadata.compressedHistory.length;
    }

    // @-mentions
    if (metadata.mentions) {
      chars += safeStringifyLength(metadata.mentions);
    }

    // File attachment metadata (not the binary content, just the XML hints)
    if (metadata.attachments) {
      // ~100 chars per attachment for the XML hint tag
      chars += metadata.attachments.length * 100;
    }
  } catch {
    // Malformed metadata — add a conservative fallback
    chars += 2000;
  }

  return chars;
};

// ─── Main serialisation function ───────────────────────────────────────────

/**
 * Converts a set of UI messages to a compact string representation
 * of the chat history, suitable for LLM-based compression.
 *
 * Includes:
 * - User and assistant text parts
 * - Compact one-liner summaries of tool calls. agent-core handles the
 *   universal file-op set internally; for any other `tool-*` part, the
 *   host's tool-part serializer registry (populated via
 *   `host.registerToolPartSerializer(s)`) is consulted (with a generic
 *   `[part.type + err]` fallback).
 * - User attachment and @-mention annotations
 *
 * Passing `host` is optional — callers that don't have a host (tests,
 * one-off scripts) get the same output as before plus generic markers
 * for any non-universal tool parts.
 *
 * The function is designed to be **bullet-proof**: malformed individual
 * parts or messages (and broken host serializers) are skipped gracefully
 * without aborting serialisation of the remaining history.
 */
export const convertAgentMessagesToCompactMessageHistoryString = (
  messages: WideAgentMessage[],
  host?: AgentHost,
): string => {
  if (!Array.isArray(messages)) return '';

  const revertedCompactedHistoryStringParts: string[] = [];

  for (let msgIndex = messages.length - 1; msgIndex >= 0; msgIndex--) {
    const message = messages[msgIndex];
    if (!message) continue;

    try {
      if (message.role === 'assistant') {
        const parts = Array.isArray(message.parts) ? message.parts : [];
        const serializedParts = parts
          .map((part) => safeSerializePart(part, host))
          .filter((part) => part !== undefined);

        revertedCompactedHistoryStringParts.push(
          `<assistant>${serializedParts.join('\n')}</assistant>`,
        );
      }

      if (message.role === 'user') {
        const metadataAnnotations = serializeUserMetadataAnnotations(
          message.metadata,
        );
        const parts = Array.isArray(message.parts) ? message.parts : [];
        const textParts = parts
          .map((part) => {
            try {
              if (part?.type === 'text') {
                return escapeTextForXML(part.text);
              }
            } catch {
              // Skip malformed user part
            }
            return undefined;
          })
          .filter((part) => part !== undefined);

        const allParts = [...metadataAnnotations, ...textParts];

        revertedCompactedHistoryStringParts.push(
          `<user>${allParts.join('\n')}</user>`,
        );
      }

      if (message.metadata?.compressedHistory) {
        revertedCompactedHistoryStringParts.push(
          `<previous-chat-history>${message.metadata.compressedHistory}</previous-chat-history>`,
        );
        break;
      }
    } catch {
      // Skip this entire message rather than abort the whole history.
      // An empty <user/> or <assistant/> would add noise with no value,
      // so we just move on.
    }
  }

  return [...revertedCompactedHistoryStringParts].reverse().join('\n');
};
