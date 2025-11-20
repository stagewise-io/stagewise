/**
 * Configuration for streaming message simulation in Storybook
 */
export interface StreamingConfig {
  /** ID of the message to animate */
  messageId: string;

  /** Complete text content to stream */
  fullContent: string;

  /** How to chunk the text for streaming */
  chunkStrategy?: 'char' | 'word' | 'sentence';

  /** Milliseconds between chunks */
  intervalMs?: number;

  /** Whether to loop the animation */
  loop?: boolean;
}

/**
 * Preset configurations for common streaming patterns
 */
export const STREAMING_PRESETS = {
  /** Fast character-by-character streaming */
  fastChar: {
    chunkStrategy: 'char' as const,
    intervalMs: 10,
    loop: true,
  },

  /** Normal word-by-word streaming (most realistic) */
  normalWord: {
    chunkStrategy: 'word' as const,
    intervalMs: 50,
    loop: true,
  },

  /** Slow sentence-by-sentence streaming */
  slowSentence: {
    chunkStrategy: 'sentence' as const,
    intervalMs: 200,
    loop: true,
  },

  /** One-time playthrough, no loop */
  oneShot: {
    chunkStrategy: 'word' as const,
    intervalMs: 50,
    loop: false,
  },
};

/**
 * Helper to create streaming config with presets
 *
 * @example
 * ```tsx
 * createStreamingConfig(
 *   'msg-id',
 *   'Hello world!',
 *   'normalWord'
 * )
 * ```
 */
export function createStreamingConfig(
  messageId: string,
  fullContent: string,
  preset: keyof typeof STREAMING_PRESETS = 'normalWord',
  overrides?: Partial<StreamingConfig>,
): StreamingConfig {
  return {
    messageId,
    fullContent,
    ...STREAMING_PRESETS[preset],
    ...overrides,
  };
}
