import { generateText } from 'ai';
import type {
  AgentMessage,
  AgentToolUIPart,
} from '@shared/karton-contracts/ui/agent';
import type { DynamicToolUIPart } from 'ai';
import type { ModelProviderService } from '@/agents/model-provider';
import { stripUnderscoreProperties } from './utils';

const TOOL_PART_CHAR_CAP = 10_000;
const REASONING_CHAR_CAP = 2_000;

function capString(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n[...truncated]`;
}

function getSimpleToolsStateString(
  toolPart: AgentToolUIPart | DynamicToolUIPart,
): string {
  const state =
    toolPart.state === 'output-available'
      ? 'SUCCESS'
      : toolPart.state === 'output-error'
        ? 'ERROR'
        : toolPart.state === 'approval-requested'
          ? 'PENDING'
          : toolPart.state === 'approval-responded'
            ? toolPart.approval?.approved
              ? 'APPROVED'
              : 'REJECTED'
            : 'UNKNOWN';
  return state;
}

function serializeToolPartForCompression(
  toolPart: AgentToolUIPart | DynamicToolUIPart,
): string {
  const toolName =
    toolPart.type === 'dynamic-tool'
      ? (toolPart as DynamicToolUIPart).toolName
      : toolPart.type.replace(/^tool-/, '');
  const state = getSimpleToolsStateString(toolPart);
  const id = toolPart.toolCallId;

  const lines: string[] = [
    `[TOOL CALL: Name:'${toolName}', ID:'${id}', State:'${state}']`,
  ];

  if (toolPart.input !== undefined) {
    const inputStr = JSON.stringify(toolPart.input);
    lines.push(`Input: ${capString(inputStr, TOOL_PART_CHAR_CAP)}`);
  }

  if (
    toolPart.state === 'output-available' &&
    'output' in toolPart &&
    toolPart.output !== undefined
  ) {
    const cleanedOutput =
      typeof toolPart.output === 'object' && toolPart.output !== null
        ? stripUnderscoreProperties(toolPart.output as Record<string, unknown>)
        : toolPart.output;
    const outputStr = JSON.stringify(cleanedOutput);
    lines.push(`Output: ${capString(outputStr, TOOL_PART_CHAR_CAP)}`);
  }

  if (
    toolPart.state === 'output-error' &&
    'errorText' in toolPart &&
    toolPart.errorText
  )
    lines.push(`Error: ${toolPart.errorText}`);

  return lines.join('\n');
}

/**
 * Converts a set of UI messages to a near-lossless string representation
 * of the chat history, suitable for LLM-based compression.
 */
export const convertAgentMessagesToCompactMessageHistoryString = (
  messages: AgentMessage[],
): string => {
  const revertedCompactedHistoryStringParts: string[] = [];

  for (let msgIndex = messages.length - 1; msgIndex >= 0; msgIndex--) {
    const message = messages[msgIndex];

    if (message.role === 'assistant') {
      const serializedParts = message.parts
        .map((part) => {
          if (part.type === 'text') {
            return part.text;
          } else if (part.type === 'reasoning') {
            return `[REASONING: ${capString(part.text, REASONING_CHAR_CAP)}]`;
          } else if (part.type === 'file') {
            return `[ATTACHED FILE: Name:'${part.filename}', Type:'${part.mediaType}']`;
          } else if (
            part.type.startsWith('tool-') ||
            part.type === 'dynamic-tool'
          ) {
            return serializeToolPartForCompression(
              part as AgentToolUIPart | DynamicToolUIPart,
            );
          }
          return undefined;
        })
        .filter((part) => part !== undefined);

      revertedCompactedHistoryStringParts.push(
        `**Assistant:**\n${serializedParts.join('\n')}`,
      );
    } else if (message.role === 'user') {
      const serializedParts = message.parts
        .map((part) => {
          if (part.type === 'text') {
            return part.text;
          }
          return undefined;
        })
        .filter((part) => part !== undefined);

      const serializedFileAttachmentMetadataParts =
        message.metadata?.fileAttachments?.map((f) => {
          return `[ATTACHED FILE: ID:'${f.id}', Name:'${f.fileName}', Type:'${f.mediaType}']`;
        });
      const serializedTextClipAttachmentMetadataParts =
        message.metadata?.textClipAttachments?.map((tc) => {
          return `[ATTACHED TEXT CLIP: ID:'${tc.id}', Name:'${tc.label}']\n${tc.content}`;
        });
      const serializedSelectedPreviewElementsMetadataParts =
        message.metadata?.selectedPreviewElements?.map((se) => {
          const details: Record<string, unknown> = {
            id: se.id,
            tagName: se.tagName,
            textContent: se.textContent,
            xpath: se.xpath,
            attributes: se.attributes,
          };
          if (se.codeMetadata?.length) {
            details.codeMetadata = se.codeMetadata.map((cm) => ({
              relation: cm.relation,
              relativePath: cm.relativePath,
              startLine: cm.startLine,
            }));
          }
          return `[SELECTED ELEMENT: ${capString(JSON.stringify(details), TOOL_PART_CHAR_CAP)}]`;
        });
      const serializedMentionParts = message.metadata?.mentions?.map((m) => {
        if (m.providerType === 'file')
          return `[MENTIONED FILE: Path:'${m.relativePath}'${m.isDirectory ? ', Directory' : ''}]`;
        if (m.providerType === 'tab')
          return `[MENTIONED TAB: Id:'${m.tabId}', URL:'${m.url}']`;
        return `[MENTIONED WORKSPACE: Prefix:'${m.prefix}', Path:'${m.path}']`;
      });

      revertedCompactedHistoryStringParts.push(
        `**User:** ${serializedParts.join(' ')} ${serializedFileAttachmentMetadataParts?.join(' ') ?? ''} ${serializedTextClipAttachmentMetadataParts?.join('\n') ?? ''} ${serializedSelectedPreviewElementsMetadataParts?.join('\n') ?? ''} ${serializedMentionParts?.join(' ') ?? ''}`.trim(),
      );

      if (message.metadata?.compressedHistory) {
        revertedCompactedHistoryStringParts.push(
          `**PREVIOUSLY COMPACTED CHAT HISTORY:**\n${message.metadata.compressedHistory}`,
        );
        break;
      }
    }
  }

  return [...revertedCompactedHistoryStringParts].reverse().join('\n');
};

export const generateSimpleCompressedHistory = async (
  messages: AgentMessage[],
  modelProviderService: ModelProviderService,
  agentInstanceId: string,
): Promise<string> => {
  const modelWithOptions = modelProviderService.getModelWithOptions(
    'gemini-3.1-flash-lite-preview',
    `${agentInstanceId}`,
    {
      $ai_span_name: 'history-compression',
      $ai_parent_id: `${agentInstanceId}`,
    },
  );

  const compactConvertedChatHistory =
    convertAgentMessagesToCompactMessageHistoryString(messages);

  const compactionResult = await generateText({
    model: modelWithOptions.model,
    providerOptions: modelWithOptions.providerOptions,
    headers: modelWithOptions.headers,
    messages: [
      {
        role: 'system',
        content: `You compress a developer chat history into a dense summary that will replace the original messages in the AI assistant's context window. The assistant that reads your summary will have NO access to the original messages — your output is the sole record.

## Input format
- **User** and **Assistant** turns with full text.
- **[TOOL CALL: ...]** blocks with Input/Output JSON and optional Error text.
- **[SELECTED ELEMENT: ...]**, **[ATTACHED TEXT CLIP: ...]**, **[MENTIONED FILE: ...]** metadata on user messages.
- **[REASONING: ...]** blocks (assistant's chain-of-thought).
- An optional **PREVIOUSLY COMPACTED CHAT HISTORY** section from an earlier compression cycle.

## What to preserve verbatim
- File paths (with line numbers when present), mount prefixes, and directory structures.
- Edit operations: which files were changed, the nature of each change, and any relevant code patterns.
- Error messages, linting diagnostics, and shell command outputs/exit codes.
- User decisions, stated preferences, constraints, and explicit rules.
- Tool call outcomes that affected project state (file writes, deletes, shell commands).
- Unresolved issues or open questions at the end of the conversation.

## What to condense or drop
- Large file-read outputs → summarize as "read <path> (<N> lines, content about <topic>)".
- Reasoning blocks → omit unless they contain a key insight not stated elsewhere.
- Redundant or superseded tool calls (e.g. an edit that was later overwritten).
- Tool call IDs.
- Verbose JSON structure → distill to the relevant fields.

## Previously compacted history
If present, treat it as established ground truth. Incorporate it as-is at the start and append the new conversation information after it. Do not re-summarize or lose details from it.

## Output rules
- Refer to participants as "user" and "assistant".
- Write chronologically. Use markdown headings to separate distinct phases or topics.
- Be more detailed for later parts of the conversation (recency bias).
- Use your full output budget — do not cut short.
- Output ONLY the summary. No titles, preambles, or meta-commentary.`,
      },
      {
        role: 'user',
        content: [{ type: 'text', text: compactConvertedChatHistory }],
      },
    ],
    temperature: 0.1,
    maxOutputTokens: 20000,
  }).then((result) => result.text);

  return compactionResult;
};
