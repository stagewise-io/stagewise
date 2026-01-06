import type { ModelSettings } from '@shared/karton-contracts/ui/shared-types';

const anthropicHeaders = {
  'anthropic-beta':
    'fine-grained-tool-streaming-2025-05-14, interleaved-thinking-2025-05-14',
};

const openaiHeaders = {};

const googleHeaders = {};

export const availableModels = [
  // Anthropic Models
  {
    modelId: 'claude-opus-4-5',
    providerOptions: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    modelDisplayName: 'Opus 4.5',
    modelDescription:
      "Anthropic's most capable model, excels at complex reasoning and architectural decisions.",
    modelContext: '200k context',
    headers: anthropicHeaders,
    thinkingEnabled: true,
  },
  {
    modelId: 'gpt-5.2',
    providerOptions: {
      reasoningEffort: 'high',
      reasoningSummary: 'auto',
      parallelToolCalls: true,
      strictJsonSchema: true,
    },
    modelDisplayName: 'GPT-5.2',
    modelDescription:
      "OpenAI's latest flagship model with advanced reasoning for complex coding tasks.",
    modelContext: '128k context',
    headers: openaiHeaders,
    thinkingEnabled: true,
  },
  {
    modelId: 'gemini-3-pro-preview',
    providerOptions: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'high',
      },
    },
    headers: googleHeaders,
    modelDisplayName: 'Gemini 3 Pro',
    modelDescription:
      "Google's advanced model with strong reasoning and multimodal capabilities.",
    modelContext: '1M context',
    thinkingEnabled: true,
  },
  {
    modelId: 'claude-haiku-4-5',
    providerOptions: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    modelDisplayName: 'Haiku 4.5',
    modelDescription:
      'Fast and cost-effective, ideal for quick iterations and simple edits.',
    modelContext: '200k context',
    headers: anthropicHeaders,
    thinkingEnabled: true,
  },
  {
    modelId: 'gpt-5.1-codex-max',
    providerOptions: {
      reasoningEffort: 'high',
      reasoningSummary: 'auto',
      parallelToolCalls: true,
      strictJsonSchema: true,
    },
    modelDisplayName: 'GPT-5.1 Codex Max',
    modelDescription:
      "OpenAI's most powerful coding model, designed for large-scale projects and complex refactoring.",
    modelContext: '128k context',
    headers: openaiHeaders,
    thinkingEnabled: true,
  },
  {
    modelId: 'claude-sonnet-4-5',
    providerOptions: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    modelDisplayName: 'Sonnet 4.5',
    modelDescription:
      "Anthropic's balanced model, great for daily coding tasks.",
    modelContext: '200k context',
    headers: anthropicHeaders,
    thinkingEnabled: true,
  },
] as const satisfies ModelSettings[];
