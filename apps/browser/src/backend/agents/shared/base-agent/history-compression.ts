import { generateText } from 'ai';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { ModelProviderService } from '@/agents/model-provider';

const escapeTextForXML = (text: string): string => {
  return text
    .replace('<user>', '\<user\>')
    .replace('</user>', '\</user\>')
    .replace('<assistant>', '\<assistant\>')
    .replace('</assistant>', '\</assistant\>')
    .replace('<chat-history>', '\<chat-history\>')
    .replace('</chat-history>', '\</chat-history\>')
    .replace('<previous-chat-history>', '\<previous-chat-history\>');
};

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
            return escapeTextForXML(part.text);
          }
          return undefined;
        })
        .filter((part) => part !== undefined);

      revertedCompactedHistoryStringParts.push(
        `<assistant>${serializedParts.join('  ')}</assistant>`,
      );
    } else if (message.role === 'user') {
      const serializedParts = message.parts
        .map((part) => {
          if (part.type === 'text') {
            return escapeTextForXML(part.text);
          }
          return undefined;
        })
        .filter((part) => part !== undefined);

      revertedCompactedHistoryStringParts.push(
        `<user>${serializedParts.join('  ')}</user>`,
      );

      if (message.metadata?.compressedHistory) {
        revertedCompactedHistoryStringParts.push(
          `<previous-chat-history>${message.metadata.compressedHistory}</previous-chat-history>`,
        );
        break;
      }
    }
  }

  return [...revertedCompactedHistoryStringParts].reverse().join('\n');
};

/**
 * Ordered list of model IDs to try for history compression.
 * The first model is the primary; subsequent entries are fallbacks
 * tried in order when the previous one fails or times out.
 */
const HISTORY_COMPRESSION_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gpt-5.4-nano',
  'claude-haiku-4-5',
] as const;

/** Maximum time (ms) allowed for a single history compression attempt. */
const HISTORY_COMPRESSION_TIMEOUT_MS = 15_000;

/** Minimum acceptable compression length; shorter results trigger a fallback. */
const COMPRESSION_MIN_LENGTH = 30;

export const generateSimpleCompressedHistory = async (
  messages: AgentMessage[],
  modelProviderService: ModelProviderService,
  agentInstanceId: string,
): Promise<string> => {
  const compactConvertedChatHistory =
    convertAgentMessagesToCompactMessageHistoryString(messages);

  let lastError: Error | undefined;

  for (const modelId of HISTORY_COMPRESSION_MODELS) {
    try {
      const modelWithOptions = modelProviderService.getModelWithOptions(
        modelId,
        `${agentInstanceId}`,
        {
          $ai_span_name: 'history-compression',
          $ai_parent_id: `${agentInstanceId}`,
        },
      );

      const abortController = new AbortController();
      const timeout = setTimeout(
        () => abortController.abort(),
        HISTORY_COMPRESSION_TIMEOUT_MS,
      );

      try {
        const compactionResult = await generateText({
          model: modelWithOptions.model,
          providerOptions: modelWithOptions.providerOptions,
          headers: modelWithOptions.headers,
          abortSignal: abortController.signal,
          messages: [
            {
              role: 'system',
              content: `Your task is to summarize a discussion between an user and an assistant from third-person. Do this by re-phrasing the discussion like a story that happened between two persons. The history must be short, precise and focus on the relevant parts of the discussions. The story should focus on the following things:

- Tasks that the assistant was told to do
- Things that the assistant told the user
- Questions that were asked by user or assistant
- Important decisions that were made by the user or the assistant
- The current state of the discussion, what the assistant is working on and why.

## What to preserve verbatim
- File paths (with line numbers when present), markdown links to paths, colors, mount prefixes, and directory structures.
- User decisions, stated preferences, constraints, and explicit rules.
- Unresolved issues or open questions at the end of the conversation.

## Previously compacted history
If present, treat it as established ground truth. Incorporate it as-is at the start and append the new conversation information after it. Do not re-summarize or lose details from it.

## Output rules
- Refer to participants as "user" and "assistant".
- Write chronologically. Use markdown headings to separate distinct phases or topics.
- Be more detailed for later parts of the conversation (recency bias).
- Use your full output budget — do not cut short.
- Output ONLY the summary. No titles, preambles, or meta-commentary.
- NO FORMATTING except for markdown links (keep verbatim from input).`,
            },
            {
              role: 'user',
              content: `<chat-history>${compactConvertedChatHistory}</chat-history> Write the story for the given chat history.`,
            },
          ],
          temperature: 0.1,
          maxOutputTokens: 20000,
        }).then((result) => result.text.trim());

        if (compactionResult.length < COMPRESSION_MIN_LENGTH) {
          throw new Error(
            `Compression too short (${compactionResult.length} chars)`,
          );
        }

        return compactionResult;
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      lastError = e as Error;
      // Continue to the next fallback model
    }
  }

  // All models failed — rethrow the last error so the caller can handle it
  throw lastError ?? new Error('All history compression models failed');
};
