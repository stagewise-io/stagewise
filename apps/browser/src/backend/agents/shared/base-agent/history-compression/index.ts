import { generateText } from 'ai';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { ModelProviderService } from '@/agents/model-provider';

// Import for local use + re-export so existing imports keep working.
import {
  convertAgentMessagesToCompactMessageHistoryString,
  estimateMessageTokens,
} from './serialization';
export {
  convertAgentMessagesToCompactMessageHistoryString,
  estimateMessageTokens,
};

// Re-export prompt pieces so existing imports from this module keep working.
import {
  COMPRESSION_SYSTEM_PROMPT,
  buildCompressionUserMessage,
} from './prompt';
export { COMPRESSION_SYSTEM_PROMPT, buildCompressionUserMessage };

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
              content: COMPRESSION_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: buildCompressionUserMessage(compactConvertedChatHistory),
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
