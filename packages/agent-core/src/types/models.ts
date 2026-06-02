import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { z } from 'zod';

/** Per-modality constraint: accepted MIME types and max inline size. */
export const modalityConstraintSchema = z.object({
  mimeTypes: z.array(z.string()),
  /**
   * Maximum raw (decoded) file size in bytes. Providers enforce this against
   * the actual image/file data, not the base64-encoded transport representation.
   * The image processor compares raw buffer length against this value directly.
   */
  maxBytes: z.number(),
  /** Maximum pixels on a single axis (width or height). Images exceeding this are downscaled. */
  maxWidthPx: z.number().optional(),
  maxHeightPx: z.number().optional(),
  /** Maximum total pixel count (width × height). Applied after per-axis limits. */
  maxTotalPixels: z.number().optional(),
});
export type ModalityConstraint = z.infer<typeof modalityConstraintSchema>;

/** Capabilities that describe what a model can do. */
export const modelCapabilitiesSchema = z.object({
  inputModalities: z
    .object({
      text: z.boolean().default(true),
      audio: z.boolean().default(false),
      image: z.boolean().default(false),
      video: z.boolean().default(false),
      file: z.boolean().default(false),
    })
    .default({
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    }),
  outputModalities: z
    .object({
      text: z.boolean().default(true),
      audio: z.boolean().default(false),
      image: z.boolean().default(false),
      video: z.boolean().default(false),
      file: z.boolean().default(false),
    })
    .default({
      text: true,
      audio: false,
      image: false,
      video: false,
      file: false,
    }),
  inputConstraints: z
    .object({
      image: modalityConstraintSchema.optional(),
      file: modalityConstraintSchema.optional(),
      video: modalityConstraintSchema.optional(),
      audio: modalityConstraintSchema.optional(),
    })
    .optional(),
  toolCalling: z.boolean().default(true),
});
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

export type StagewiseProviderOptions = {
  reasoning?: {
    enabled: boolean;
    effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  };
  cache_control?: {
    type: 'ephemeral' | 'persistent';
  };
  /**
   * OpenRouter provider routing preferences (forwarded verbatim).
   * See https://openrouter.ai/docs/provider-routing.
   */
  provider?: {
    /** Only route to endpoints that support every parameter in the request (e.g. tools). */
    require_parameters?: boolean;
    /** Restrict routing to an allow-list of upstream providers (lower-case slugs). */
    only?: string[];
    /** Preferred ordering of upstream providers. */
    order?: string[];
  };
};

export type ModelSettings = {
  modelId: string;
  /** Which provider should be used for the official API option. */
  officialProvider?: string;
  modelDisplayName: string;
  modelDescription: string;
  modelContext: string;
  modelContextRaw: number;
  headers?: Record<string, string>;
  /** Per-provider configuration options. */
  providerOptions: {
    stagewise?: StagewiseProviderOptions;
    google?: GoogleGenerativeAIProviderOptions;
    anthropic?: AnthropicProviderOptions;
    openai?: OpenAIResponsesProviderOptions;
  } & Record<string, unknown>;
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
    relativeMultiplier: number;
  };
  thinkingEnabled: boolean;
  capabilities: {
    inputModalities: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      file: boolean;
    };
    outputModalities: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      file: boolean;
    };
    inputConstraints?: {
      image?: ModalityConstraint;
      file?: ModalityConstraint;
      video?: ModalityConstraint;
      audio?: ModalityConstraint;
    };
    toolCalling: boolean;
  };
};
