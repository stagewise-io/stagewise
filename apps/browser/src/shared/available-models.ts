import type { ModelSettings } from '@shared/karton-contracts/ui/shared-types';

const anthropicHeaders = {
  'anthropic-beta':
    'fine-grained-tool-streaming-2025-05-14, interleaved-thinking-2025-05-14',
};

const openaiHeaders = {};

const googleHeaders = {};

export const PRICING_REFERENCE = {
  inputPerMillion: 1.0,
  outputPerMillion: 5.0,
};

import type { ModalityConstraint } from '@shared/karton-contracts/ui/shared-types';

type InputConstraints = {
  image?: ModalityConstraint;
  file?: ModalityConstraint;
  video?: ModalityConstraint;
  audio?: ModalityConstraint;
};

const ANTHROPIC_INPUT_CONSTRAINTS: InputConstraints = {
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 5_242_880, // 5 MB per image
    maxWidthPx: 8000,
    maxHeightPx: 8000,
    maxTotalPixels: 1_200_000, // Anthropic enforces a 1.2 MP per-image limit
  },
  file: {
    mimeTypes: ['application/pdf'],
    maxBytes: 32_000_000, // 32 MB request limit
  },
};

// Patch-based tokenization (32×32 px patches) for all supported OpenAI models.
// Two constraints apply simultaneously:
//   1. Neither dimension may exceed 2048 px.
//   2. Total pixels may not exceed patch_budget × 32².
//
// Supported OpenAI models (GPT-4o, GPT-4.1, o-series excl. o4-mini): 1,536 patches
//   → 1,536 × 1,024 = 1,572,864 px ≈ 1.54 MP
const OPENAI_INPUT_CONSTRAINTS: InputConstraints = {
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 5_242_880, // 5 MB effective limit (20 MB API cap)
    maxWidthPx: 2048,
    maxHeightPx: 2048,
    maxTotalPixels: 1_572_864, // 1,536 patches × 32²
  },
  file: {
    mimeTypes: ['application/pdf'],
    maxBytes: 20_971_520, // 20 MB
  },
};

// GPT-5.4 and later: 2,500 patches
//   → 2,500 × 1,024 = 2,560,000 px ≈ 2.5 MP
//   Same 2048 max-dimension rule applies.
const GPT54_INPUT_CONSTRAINTS: InputConstraints = {
  ...OPENAI_INPUT_CONSTRAINTS,
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 5_242_880,
    maxWidthPx: 2048,
    maxHeightPx: 2048,
    maxTotalPixels: 2_560_000, // 2,500 patches × 32²
  },
};

const GOOGLE_INPUT_CONSTRAINTS: InputConstraints = {
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 104_857_600, // 100 MB inline
    maxWidthPx: 4096,
    maxHeightPx: 4096,
    maxTotalPixels: 2_500_000, // 2.5 MP
  },
  file: {
    mimeTypes: ['application/pdf'],
    maxBytes: 104_857_600, // 100 MB inline
  },
  video: {
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxBytes: 104_857_600, // 100 MB inline
  },
};

export const availableModels = [
  // Anthropic Models
  {
    officialProvider: 'anthropic',
    modelId: 'claude-opus-4.7',
    modelDisplayName: 'Opus 4.7',
    modelDescription:
      "Anthropic's most capable model, excels at complex reasoning and architectural decisions.",
    modelContext: '1M context',
    modelContextRaw: 1000000,
    headers: anthropicHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'medium',
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 5.0,
      outputPerMillion: 25.0,
      relativeMultiplier: 5.3,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: ANTHROPIC_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'anthropic',
    modelId: 'claude-opus-4.6',
    modelDisplayName: 'Opus 4.6',
    modelDescription:
      'Previous-generation Opus model. Still highly capable for complex reasoning tasks.',
    modelContext: '200k context',
    modelContextRaw: 200000,
    headers: anthropicHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'medium',
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 5.0,
      outputPerMillion: 25.0,
      relativeMultiplier: 5.3,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: ANTHROPIC_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'openai',
    modelId: 'gpt-5.4',
    modelDisplayName: 'GPT-5.4',
    modelDescription:
      "OpenAI's latest model with the most advanced capabilities.",
    modelContext: '1.1m context',
    modelContextRaw: 1100000,
    headers: openaiHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 2.5,
      outputPerMillion: 15.0,
      relativeMultiplier: 3.1,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GPT54_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'google',
    modelId: 'gemini-3.1-pro-preview',
    modelDisplayName: 'Gemini 3.1 Pro (Preview)',
    modelDescription:
      "Google's latest model with strong reasoning and multimodal capabilities. Preview version (may be unstable).",
    modelContext: '1M context',
    modelContextRaw: 1000000,
    headers: googleHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' },
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 2.0,
      outputPerMillion: 12.0,
      relativeMultiplier: 2.5,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: true,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'openai',
    modelId: 'gpt-5.3-codex',
    modelDisplayName: 'GPT-5.3 Codex',
    modelDescription:
      "OpenAI's most powerful coding model, designed for large-scale projects and complex refactoring.",
    modelContext: '128k context',
    modelContextRaw: 128000,
    headers: openaiHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'high' } },
      openai: {
        reasoningEffort: 'high',
        reasoningSummary: 'auto',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 1.75,
      outputPerMillion: 14.0,
      relativeMultiplier: 2.9,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: OPENAI_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'anthropic',
    modelId: 'claude-sonnet-4.6',

    modelDisplayName: 'Sonnet 4.6',
    modelDescription:
      "Anthropic's balanced model, great for daily coding tasks.",
    modelContext: '200k context',
    modelContextRaw: 200000,
    headers: anthropicHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
      relativeMultiplier: 3.2,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: ANTHROPIC_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'moonshotai',
    modelId: 'kimi-k2.6',
    modelDisplayName: 'Kimi K2.6',
    modelDescription:
      "Kimi's latest flagship with stronger long-horizon coding, improved instruction compliance, and native multimodal input (text, image, video).",
    modelContext: '256k context',
    modelContextRaw: 262144,
    headers: {},
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      moonshotai: {
        thinking: { type: 'adaptive' },
        effort: 'medium',
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.95,
      outputPerMillion: 4.0,
      relativeMultiplier: 0.85,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: true,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'moonshotai',
    modelId: 'kimi-k2.5',
    modelDisplayName: 'Kimi K2.5',
    modelDescription:
      "Kimi's most versatile model to date, featuring a native multimodal architecture for dialogue and agent tasks.",
    modelContext: '250k context',
    modelContextRaw: 250000,
    headers: {},
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      moonshotai: {
        thinking: { type: 'adaptive' },
        effort: 'medium',
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.45,
      outputPerMillion: 2.2,
      relativeMultiplier: 0.5,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: true,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'openai',
    modelId: 'gpt-5.3-chat',
    modelDisplayName: 'GPT-5.3 Instant',
    modelDescription: "OpenAI's latest chatting model for daily use.",
    modelContext: '200k context',
    modelContextRaw: 200000,
    headers: openaiHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 1.1,
      outputPerMillion: 14.0,
      relativeMultiplier: 2.8,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: OPENAI_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'openai',
    modelId: 'gpt-5.4-mini',
    modelDisplayName: 'GPT-5.4 mini',
    modelDescription:
      "OpenAI's strongest mini model for coding, computer use, and subagents.",
    modelContext: '400k context',
    modelContextRaw: 400000,
    headers: openaiHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.75,
      outputPerMillion: 4.5,
      relativeMultiplier: 0.9,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GPT54_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'google',
    modelId: 'gemini-3-flash-preview',
    modelDisplayName: 'Gemini 3 Flash',
    modelDescription:
      "Google's most intelligent model built for speed, combining frontier intelligence with superior search and grounding.",
    modelContext: '1m context',
    modelContextRaw: 1000000,
    headers: googleHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.5,
      outputPerMillion: 3.0,
      relativeMultiplier: 0.6,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'anthropic',
    modelId: 'claude-haiku-4.5',
    modelDisplayName: 'Haiku 4.5',
    modelDescription:
      'Fast and cost-effective, ideal for quick iterations and simple edits.',
    modelContext: '200k context',
    modelContextRaw: 200000,
    headers: anthropicHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 1.0,
      outputPerMillion: 5.0,
      relativeMultiplier: 1.0,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: ANTHROPIC_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'google',
    modelId: 'gemini-3.1-flash-lite-preview',
    modelDisplayName: 'Gemini 3.1 Flash Lite (Preview)',
    modelDescription:
      "Google's workhorse model for high-speed and high-volume use, with improvements across translation, data extraction, and code completion.",
    modelContext: '1m context',
    modelContextRaw: 1000000,
    headers: googleHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.25,
      outputPerMillion: 1.5,
      relativeMultiplier: 0.3,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'openai',
    modelId: 'gpt-5.4-nano',
    modelDisplayName: 'GPT-5.4 nano',
    modelDescription:
      "OpenAI's cheapest GPT-5.4-class model for simple high-volume tasks.",
    modelContext: '400k context',
    modelContextRaw: 400000,
    headers: openaiHeaders,
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.2,
      outputPerMillion: 1.25,
      relativeMultiplier: 0.25,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GPT54_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'alibaba',
    modelId: 'qwen3-32b',
    modelDisplayName: 'Qwen 3-32B',
    modelDescription:
      'Qwen3-32B is a world-class model with comparable quality to DeepSeek R1 while outperforming GPT-4.1 and Claude Sonnet 3.7.',
    modelContext: '128k context',
    modelContextRaw: 128000,
    headers: {},
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.08,
      outputPerMillion: 0.24,
      relativeMultiplier: 0.05,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
  {
    officialProvider: 'alibaba',
    modelId: 'qwen3-coder-30b-a3b-instruct',
    modelDisplayName: 'Qwen 3-Coder 30B-A3B',
    modelDescription:
      'Efficient coding specialist balancing performance with cost-effectiveness for daily development tasks while maintaining strong tool integration capabilities.',
    modelContext: '260k context',
    modelContextRaw: 260000,
    headers: {},
    providerOptions: {
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
    },
    thinkingEnabled: true,
    pricing: {
      inputPerMillion: 0.07,
      outputPerMillion: 0.27,
      relativeMultiplier: 0.06,
    },
    capabilities: {
      inputModalities: {
        text: true,
        audio: false,
        image: true,
        video: false,
        file: true,
      },
      outputModalities: {
        text: true,
        audio: false,
        image: false,
        video: false,
        file: false,
      },
      inputConstraints: GOOGLE_INPUT_CONSTRAINTS,
      toolCalling: true,
    },
  },
] as const satisfies ModelSettings[];

export type BuiltInModelId = (typeof availableModels)[number]['modelId'];
export type ModelId = BuiltInModelId | (string & {});

/**
 * Look up a model's capabilities by ID.
 * Falls back to text-only when the model is unknown (e.g. custom model
 * without capabilities defined).
 */
export function getModelCapabilities(
  modelId: ModelId,
): ModelSettings['capabilities'] {
  const model = availableModels.find((m) => m.modelId === modelId);
  if (model) return model.capabilities;

  return {
    inputModalities: {
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    },
    outputModalities: {
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    },
    inputConstraints: undefined,
    toolCalling: true,
  };
}

/**
 * Find model IDs that accept a given MIME type as inline input,
 * optionally excluding one model (typically the current one).
 */
export function findModelsAcceptingMime(
  mime: string,
  excludeModelId?: string,
): string[] {
  const lowerMime = mime.toLowerCase();
  return availableModels
    .filter((m) => {
      if (m.modelId === excludeModelId) return false;
      const c = m.capabilities.inputConstraints;
      if (!c) return false;
      for (const constraint of [c.image, c.file, c.video, c.audio])
        if (constraint?.mimeTypes.includes(lowerMime)) return true;

      return false;
    })
    .map((m) => m.modelId);
}
