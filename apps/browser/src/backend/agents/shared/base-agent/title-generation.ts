import { generateText } from 'ai';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  type ModelProviderService,
  deepMergeProviderOptions,
} from '@/agents/model-provider';

/**
 * Ordered list of model IDs to try for title generation.
 * The first model is the primary; subsequent entries are fallbacks
 * tried in order when the previous one fails or times out.
 */
const TITLE_GENERATION_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gpt-5.4-nano',
  'claude-haiku-4-5',
] as const;

/** Maximum time (ms) allowed for a single title generation attempt. */
const TITLE_GENERATION_TIMEOUT_MS = 15_000;

/** Minimum acceptable title length; shorter results trigger a fallback. */
const TITLE_MIN_LENGTH = 6;

export const generateSimpleTitle = async (
  messages: AgentMessage[],
  modelProviderService: ModelProviderService,
  agentInstanceId: string,
): Promise<string> => {
  const messageList = messages
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    )
    .slice(-10)
    .map((message) =>
      `${message.role}: ${message.parts.map((part) => (part.type === 'text' ? part.text.replace(/[\n\r]+/g, '  ').slice(0, 200) : `(ATTACHED ${part.type})`)).join(' ')}`.slice(
        0,
        500,
      ),
    )
    .join('\n');

  let lastError: Error | undefined;

  for (const modelId of TITLE_GENERATION_MODELS) {
    try {
      const modelWithOptions = modelProviderService.getModelWithOptions(
        modelId,
        `${agentInstanceId}`,
        {
          $ai_span_name: 'title-generation',
          $ai_parent_id: agentInstanceId,
        },
      );

      const abortController = new AbortController();
      const timeout = setTimeout(
        () => abortController.abort(),
        TITLE_GENERATION_TIMEOUT_MS,
      );

      try {
        const title = await generateText({
          model: modelWithOptions.model,
          providerOptions: deepMergeProviderOptions(
            modelWithOptions.providerOptions,
            { anthropic: { thinking: { type: 'disabled' } } },
          ),
          headers: modelWithOptions.headers,
          abortSignal: abortController.signal,
          messages: [
            {
              role: 'system',
              content:
                'Summarize the current intention of the user into a very short and precise title with a maximum of 7 words. Only output the short title, nothing else. Don\'t use markdown formatting. Output a single, raw, simple sentence. Don\'t mention "user" or "assistant". Write from the perspective of the user.',
            },
            {
              role: 'user',
              content: `<conversation>${messageList}</conversation> Generate a short title for this conversation.`,
            },
          ],
          temperature: 0.15,
          maxOutputTokens: 100,
        }).then((result) => result.text.trim());

        if (title.length < TITLE_MIN_LENGTH) {
          throw new Error(
            `Title too short (${title.length} chars): "${title}"`,
          );
        }

        return title;
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      lastError = e as Error;
      // Continue to the next fallback model
    }
  }

  // All models failed — rethrow the last error so the caller can handle it
  throw lastError ?? new Error('All title generation models failed');
};
