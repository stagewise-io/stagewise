import { generateText } from 'ai';
import type { AgentMessage } from '../../../types/agent';
import type { HostModels } from '../../../host/models';
import { deepMergeProviderOptions } from '../provider-options';
import { TITLE_GENERATION_SYSTEM_PROMPT } from './prompt';

/**
 * Ordered list of model IDs to try for title generation.
 * The first model is the primary; subsequent entries are fallbacks
 * tried in order when the previous one fails or times out.
 */
const TITLE_GENERATION_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gpt-5.4-nano',
  'claude-haiku-4.5',
] as const;

/** Maximum time (ms) allowed for a single title generation attempt. */
const TITLE_GENERATION_TIMEOUT_MS = 15_000;

/** Minimum acceptable title length; shorter results trigger a fallback. */
const TITLE_MIN_LENGTH = 6;

/** Minimum acceptable word count; single-word titles are never useful. */
const TITLE_MIN_WORDS = 2;

/**
 * Post-process a raw title string from the LLM.
 * Strips wrapping quotes, markdown formatting, and trailing punctuation.
 */
const sanitizeTitle = (raw: string): string => {
  let title = raw.trim();

  // Strip wrapping quotes
  if (
    (title.startsWith('"') && title.endsWith('"')) ||
    (title.startsWith("'") && title.endsWith("'"))
  ) {
    title = title.slice(1, -1);
  }

  // Strip markdown formatting (targeted to preserve # inside words like C#)
  title = title.replace(/^#+\s*/gm, ''); // leading heading hashes
  title = title.replace(/`([^`]*)`/g, '$1'); // unwrap backtick spans
  title = title.replace(/\*+([^*]+)\*+/g, '$1'); // unwrap emphasis

  // Remove trailing punctuation
  title = title.replace(/[.…:!?]+$/, '');

  return title.trim();
};

/**
 * Generate a short conversation title for the given message history.
 *
 * Walks `TITLE_GENERATION_MODELS` in order, timing each attempt out at
 * {@link TITLE_GENERATION_TIMEOUT_MS}. Returns the first title that
 * meets the length/word-count floor; rethrows the last error if every
 * fallback fails.
 *
 * The `hostModels` argument is the core `HostModels.getWithOptions`
 * seam — hosts translate it into their native model provider. Unlike
 * the legacy browser `ModelProviderService.getModelWithOptions`, the
 * core contract is async.
 */
export const generateSimpleTitle = async (
  messages: AgentMessage[],
  hostModels: HostModels,
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
      const modelWithOptions = await hostModels.getWithOptions(
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
              content: TITLE_GENERATION_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: `<conversation>
${messageList}
</conversation>`,
            },
          ],
          temperature: 0.15,
          maxOutputTokens: 100,
        }).then((result) => sanitizeTitle(result.text));

        if (title.length < TITLE_MIN_LENGTH) {
          throw new Error(
            `Title too short (${title.length} chars): "${title}"`,
          );
        }

        if (title.split(/\s+/).length < TITLE_MIN_WORDS) {
          throw new Error(`Title too few words: "${title}"`);
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

export { TITLE_GENERATION_SYSTEM_PROMPT } from './prompt';
