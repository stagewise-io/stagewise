import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';

const escapeTextForXML = (text: string): string => {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// ─── Tool part → compact one-liner ─────────────────────────────────────────

// ─── Helpers for output-aware serialisation ────────────────────────────────

/**
 * Returns a short error suffix when a tool part is in an error/denied state.
 * Returns `undefined` when the tool completed normally.
 */
const getErrorSuffix = (
  part: AgentMessage['parts'][number],
): string | undefined => {
  if (!('state' in part)) return undefined;
  if (part.state === 'output-error') {
    const msg = ('errorText' in part && part.errorText) || 'unknown error';
    return ` ✗ ${String(msg).split('\n')[0].slice(0, 80)}`;
  }
  if (part.state === 'output-denied') return ' ✗ denied';
  return undefined;
};

/**
 * Formats a compact representation of the answers the user provided
 * to an `askUserQuestions` form.
 */
const formatAskUserAnswers = (
  output: {
    completed: boolean;
    cancelled: boolean;
    cancelReason?: string | null;
    answers: Record<string, unknown>;
  },
  input: {
    title: string;
    steps: { fields: { questionId: string; label: string }[] }[];
  },
): string => {
  const title = input?.title ?? 'form';

  if (output.cancelled || !output.completed) {
    const reason = output.cancelReason ?? 'cancelled';
    return `[asked user: ${title} → ${reason}]`;
  }

  // Build a label→answer map for readability
  const labelMap = new Map<string, string>();
  for (const step of input?.steps ?? []) {
    for (const field of step?.fields ?? []) {
      if (field?.questionId) {
        labelMap.set(field.questionId, field.label ?? field.questionId);
      }
    }
  }

  const answers = output.answers ?? {};
  const pairs = Object.entries(answers)
    .map(([qId, val]) => {
      const label = labelMap.get(qId) ?? qId;
      return `${label}: ${String(val)}`;
    })
    .join('; ');
  return `[asked user: ${title} → ${pairs}]`;
};

/**
 * Serialises a tool-call part into a short, human-readable summary.
 * Returns `undefined` for tool types that are not worth surfacing.
 *
 * When the tool has completed (`output-available`), output data is used
 * to enrich the one-liner (e.g. shell exit code, lint issue count,
 * user form answers). Error states are surfaced with a ✗ marker.
 */
const serializeToolPart = (
  part: AgentMessage['parts'][number],
): string | undefined => {
  if (!('input' in part) || !part.input) return undefined;

  const err = getErrorSuffix(part);

  switch (part.type) {
    case 'tool-readFile':
      if (err) return `[read: ${part.input.relative_path}${err}]`;
      return `[read: ${part.input.relative_path}]`;

    case 'tool-multiEdit':
      if (err) return `[edited: ${part.input.relative_path}${err}]`;
      return `[edited: ${part.input.relative_path} (${Array.isArray(part.input.edits) ? part.input.edits.length : '?'} edits)]`;

    case 'tool-overwriteFile': {
      if (err) return `[wrote: ${part.input.relative_path}${err}]`;
      // Distinguish create vs update when output.message is available
      const owMsg = part.output?.message;
      if (typeof owMsg === 'string' && owMsg.includes('created'))
        return `[created: ${part.input.relative_path}]`;
      return `[wrote: ${part.input.relative_path}]`;
    }

    case 'tool-deleteFile':
      return `[deleted: ${part.input.relative_path}${err ?? ''}]`;

    case 'tool-executeShellCommand': {
      const label = String(
        part.input.explanation ?? part.input.command ?? '',
      ).slice(0, 80);
      if (err) return `[shell: ${label}${err}]`;
      if (part.output) {
        const { exit_code, timed_out } = part.output;
        if (timed_out) return `[shell: ${label} → timed out]`;
        if (typeof exit_code === 'number' && exit_code !== 0)
          return `[shell: ${label} → exit ${exit_code}]`;
        if (typeof exit_code === 'number') return `[shell: ${label} → ✓]`;
      }
      return `[shell: ${label}]`;
    }

    case 'tool-executeSandboxJs':
      return `[sandbox: ${String(part.input.explanation ?? '').slice(0, 80)}${err ?? ''}]`;

    case 'tool-grepSearch':
      if (err) return `[searched: "${part.input.query}"${err}]`;
      return `[searched: "${part.input.query}"${part.input.include_file_pattern ? ` in ${part.input.include_file_pattern}` : ''}]`;

    case 'tool-glob':
      return `[glob: ${part.input.pattern}${err ?? ''}]`;

    case 'tool-listFiles':
      return `[listed: ${part.input.relative_path}${err ?? ''}]`;

    case 'tool-getLintingDiagnostics': {
      const paths = Array.isArray(part.input.paths)
        ? part.input.paths.join(', ')
        : part.input.paths;
      if (err) return `[lint: ${paths}${err}]`;
      if (part.output?.summary) {
        const s = part.output.summary;
        if (s.totalIssues === 0) return `[lint: ${paths} → clean]`;
        return `[lint: ${paths} → ${s.errors} errors, ${s.warnings} warnings]`;
      }
      return `[lint: ${paths}]`;
    }

    case 'tool-listLibraryDocs':
      return `[docs-search: ${part.input.name}${err ?? ''}]`;

    case 'tool-searchInLibraryDocs':
      return `[docs-read: ${part.input.libraryId} → ${part.input.topic}${err ?? ''}]`;

    case 'tool-askUserQuestions': {
      if (err) return `[asked user: ${part.input.title ?? 'form'}${err}]`;
      if (part.output) {
        return formatAskUserAnswers(part.output, part.input);
      }
      return `[asked user: ${part.input.title ?? 'form'}]`;
    }

    default:
      // Future tools — emit a generic marker so they're not silently lost
      if (part.type.startsWith('tool-')) return `[${part.type}${err ?? ''}]`;

      return undefined;
  }
};

/**
 * Safely serialises a single part. If the part is malformed or throws,
 * returns a short fallback marker instead of propagating the error.
 */
const safeSerializePart = (
  part: AgentMessage['parts'][number],
): string | undefined => {
  try {
    if (part.type === 'text') {
      return escapeTextForXML(part.text);
    }
    return serializeToolPart(part);
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
  metadata: AgentMessage['metadata'],
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
export const estimateMessageTokens = (msg: AgentMessage): number => {
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
    // Environment snapshot / env-changes — serialised as XML into the prompt
    if (metadata.environmentSnapshot) {
      chars += safeStringifyLength(metadata.environmentSnapshot);
    }

    // Compressed history on boundary messages
    if (metadata.compressedHistory) {
      chars += metadata.compressedHistory.length;
    }

    // @-mentions
    if (metadata.mentions) {
      chars += safeStringifyLength(metadata.mentions);
    }

    // Selected DOM elements
    if (metadata.selectedPreviewElements) {
      chars += safeStringifyLength(metadata.selectedPreviewElements);
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
 * - Compact one-liner summaries of tool calls (files read/edited/deleted,
 *   shell commands, searches, etc.)
 * - User attachment and @-mention annotations
 *
 * This module is intentionally dependency-free (apart from the AgentMessage
 * type) so it can be imported from scripts outside the Electron app context.
 *
 * The function is designed to be **bullet-proof**: malformed individual
 * parts or messages are skipped gracefully without aborting serialisation
 * of the remaining history.
 */
export const convertAgentMessagesToCompactMessageHistoryString = (
  messages: AgentMessage[],
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
          .map((part) => safeSerializePart(part))
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
