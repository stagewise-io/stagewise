import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DiscoveredModel } from '@shared/karton-contracts/ui/shared-types';
import { openrouterProviderType } from './openrouter';

// ----------------------------------------------------------------------------
// Helpers — build a minimal OpenRouter /v1/models response
// ----------------------------------------------------------------------------

function makeOpenRouterResponse(
  models: Array<{
    id: string;
    name?: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    architecture?: {
      input_modalities?: string[];
      output_modalities?: string[];
    };
    supported_parameters?: string[];
  }>,
) {
  return { data: models };
}

const SAMPLE_MODELS = makeOpenRouterResponse([
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'Claude Opus 4.8',
    context_length: 200_000,
    pricing: { prompt: '0.000015', completion: '0.000075' },
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
    supported_parameters: ['tools', 'reasoning'],
  },
  {
    id: 'openai/gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    context_length: 128_000,
    pricing: { prompt: '0.000005', completion: '0.000015' },
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
    supported_parameters: ['tools', 'reasoning'],
  },
  {
    id: 'google/gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    context_length: 1_000_000,
    pricing: { prompt: '0.00000125', completion: '0.000005' },
    architecture: {
      input_modalities: ['text', 'image', 'video', 'audio'],
      output_modalities: ['text'],
    },
    supported_parameters: ['tools'],
  },
  // Meta-model — tilde prefix
  {
    id: '~anthropic/claude-haiku-latest',
    name: 'Claude Haiku (latest)',
    context_length: 200_000,
    supported_parameters: ['tools'],
  },
  // Router model — openrouter/ prefix
  {
    id: 'openrouter/auto',
    name: 'OpenRouter Auto',
    supported_parameters: [],
  },
  // Free model — zero pricing
  {
    id: 'meta/llama-4-maverick:free',
    name: 'Llama 4 Maverick (Free)',
    context_length: 256_000,
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['tools'],
  },
]);

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('openrouterProviderType', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Provider type metadata ──────────────────────────────────────────────

  it('exposes the correct id, category, and apiSpec', () => {
    expect(openrouterProviderType.id).toBe('openrouter');
    expect(openrouterProviderType.category).toBe('official-api');
    expect(openrouterProviderType.apiSpec).toBe('openai-chat-completions');
    expect(openrouterProviderType.providerMode).toBe('official');
  });

  it('declares encryptedApiKey as a sensitive field', () => {
    expect(openrouterProviderType.sensitiveFields).toContain('encryptedApiKey');
  });

  // ── Discovery — getInitialModels / refreshModels ────────────────────────

  it('discovers models from the OpenRouter /v1/models endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_MODELS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const models = await openrouterProviderType.getInitialModels!(
      { encryptedApiKey: 'test-key' },
      { encryptedApiKey: 'test-key' },
    );

    expect(models).toHaveLength(6);

    // Check the first model (Claude Opus 4.8)
    const claude = models[0] as DiscoveredModel;
    expect(claude.modelId).toBe('anthropic/claude-opus-4.8');
    expect(claude.displayName).toBe('Claude Opus 4.8');
    expect(claude.contextWindow).toBe(200_000);
    expect(claude.thinkingEnabled).toBe(true);
    expect(claude.capabilities?.toolCalling).toBe(true);
    expect(claude.capabilities?.inputModalities.image).toBe(true);
    expect(claude.capabilities?.inputModalities.text).toBe(true);
    expect(claude.capabilities?.outputModalities.text).toBe(true);
    expect(claude.pricing?.inputPerMillion).toBe(15);
    expect(claude.pricing?.outputPerMillion).toBe(75);
  });

  it('detects reasoning-capable models via supported_parameters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_MODELS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const models = await openrouterProviderType.refreshModels!(
      { encryptedApiKey: 'test-key' },
      { encryptedApiKey: 'test-key' },
    );

    const claude = models.find(
      (m) => m.modelId === 'anthropic/claude-opus-4.8',
    ) as DiscoveredModel;
    expect(claude.thinkingEnabled).toBe(true);

    const gemini = models.find(
      (m) => m.modelId === 'google/gemini-3.1-pro',
    ) as DiscoveredModel;
    expect(gemini.thinkingEnabled).toBeUndefined();
  });

  it('marks tilde-prefixed and openrouter/ models as not recommended', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_MODELS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const models = await openrouterProviderType.getInitialModels!({}, {});

    const tildeModel = models.find(
      (m) => m.modelId === '~anthropic/claude-haiku-latest',
    ) as DiscoveredModel;
    expect(tildeModel.recommended).toBe(false);

    const routerModel = models.find(
      (m) => m.modelId === 'openrouter/auto',
    ) as DiscoveredModel;
    expect(routerModel.recommended).toBe(false);

    // Regular models should not set recommended: false
    const claude = models.find(
      (m) => m.modelId === 'anthropic/claude-opus-4.8',
    ) as DiscoveredModel;
    expect(claude.recommended).toBeUndefined();
  });

  it('omits pricing for free models (zero-cost)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_MODELS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const models = await openrouterProviderType.getInitialModels!({}, {});

    const freeModel = models.find(
      (m) => m.modelId === 'meta/llama-4-maverick:free',
    ) as DiscoveredModel;
    expect(freeModel.pricing).toBeUndefined();
  });

  it('omits contextWindow when context_length is missing or zero', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          makeOpenRouterResponse([
            { id: 'test/no-context', name: 'No Context' },
            { id: 'test/zero-context', context_length: 0 },
          ]),
        ),
        { status: 200 },
      ),
    );

    const models = await openrouterProviderType.getInitialModels!({}, {});

    expect(models).toHaveLength(2);
    expect(models[0]?.contextWindow).toBeUndefined();
    expect(models[1]?.contextWindow).toBeUndefined();
  });

  it('handles missing architecture gracefully with default toolCalling', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          makeOpenRouterResponse([
            {
              id: 'test/no-arch',
              name: 'No Architecture',
              supported_parameters: ['tools'],
            },
          ]),
        ),
        { status: 200 },
      ),
    );

    const models = await openrouterProviderType.getInitialModels!({}, {});

    const model = models[0] as DiscoveredModel;
    expect(model.capabilities).toBeUndefined();
  });

  it('sends Authorization header when API key is provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(SAMPLE_MODELS), { status: 200 }),
      );

    await openrouterProviderType.getInitialModels!(
      { encryptedApiKey: 'secret-key' },
      { encryptedApiKey: 'secret-key' },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer secret-key',
    });
  });

  it('omits Authorization header when no API key is set', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(SAMPLE_MODELS), { status: 200 }),
      );

    await openrouterProviderType.getInitialModels!({}, {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers?.Authorization).toBeUndefined();
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );

    await expect(
      openrouterProviderType.getInitialModels!(
        { encryptedApiKey: 'bad-key' },
        { encryptedApiKey: 'bad-key' },
      ),
    ).rejects.toThrow(/returned 403/);
  });

  it('handles empty model list gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const models = await openrouterProviderType.getInitialModels!({}, {});

    expect(models).toEqual([]);
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it('rejects validation when no API key is provided', async () => {
    const result = await openrouterProviderType.validateCredentials!({}, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('required');
    }
  });

  // ── Model creation ─────────────────────────────────────────────────────

  it('createLanguageModel returns a model object', () => {
    const result = openrouterProviderType.createLanguageModel({
      modelId: 'anthropic/claude-opus-4.8',
      apiKey: 'test-key',
      baseURL: 'https://openrouter.ai/api/v1',
      config: { encryptedApiKey: 'test-key' },
      decryptedConfig: { encryptedApiKey: 'test-key' },
    });

    expect(result.model).toBeDefined();
    expect(typeof result.model).toBe('object');
  });
});
