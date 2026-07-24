import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codingPlanProviderType } from './coding-plan';

const getInitialModelsMock = vi.hoisted(() => vi.fn());

vi.mock('./official-api', () => ({
  OFFICIAL_API_TYPES: {
    alibaba: {
      getInitialModels: getInitialModelsMock,
      createLanguageModel: vi.fn(),
    },
  },
}));

describe('codingPlanProviderType model discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps every model returned by Token Plan discovery', async () => {
    getInitialModelsMock.mockResolvedValue([
      { modelId: 'qwen3.8-max-preview', displayName: 'Qwen 3.8 Max' },
      { modelId: 'wan2.7-image', displayName: 'Wan Image' },
      { modelId: 'unlisted-chat-model', displayName: 'Unlisted' },
    ]);

    const models = await codingPlanProviderType.getInitialModels!(
      { planId: 'qwen-token-plan' },
      { encryptedApiKey: 'token-key' },
    );

    expect(models).toEqual([
      { modelId: 'qwen3.8-max-preview', displayName: 'Qwen 3.8 Max' },
      { modelId: 'wan2.7-image', displayName: 'Wan Image' },
      { modelId: 'unlisted-chat-model', displayName: 'Unlisted' },
    ]);
    expect(getInitialModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl:
          'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      }),
      { encryptedApiKey: 'token-key' },
    );
  });

  it('uses a custom Token Plan endpoint for discovery', async () => {
    getInitialModelsMock.mockResolvedValue([]);

    await codingPlanProviderType.getInitialModels!(
      {
        planId: 'qwen-token-plan',
        baseUrl: ' https://token-plan.eu.example.com/compatible-mode/v1/ ',
      },
      { encryptedApiKey: 'token-key' },
    );

    expect(getInitialModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://token-plan.eu.example.com/compatible-mode/v1',
      }),
      { encryptedApiKey: 'token-key' },
    );
  });

  it('keeps newly discovered Coding Plan models outside the fallback', async () => {
    getInitialModelsMock.mockResolvedValue([
      { modelId: 'qwen-new-model', displayName: 'Qwen New Model' },
    ]);

    const models = await codingPlanProviderType.getInitialModels!(
      { planId: 'qwen-plan' },
      { encryptedApiKey: 'coding-key' },
    );

    expect(models).toEqual([
      { modelId: 'qwen-new-model', displayName: 'Qwen New Model' },
    ]);
  });

  it('propagates explicit refresh failures', async () => {
    getInitialModelsMock.mockRejectedValue(new Error('models unavailable'));

    await expect(
      codingPlanProviderType.refreshModels!(
        { planId: 'qwen-token-plan' },
        { encryptedApiKey: 'token-key' },
      ),
    ).rejects.toThrow('models unavailable');
  });

  it('seeds Coding Plan models when initial discovery is unavailable', async () => {
    getInitialModelsMock.mockRejectedValue(new Error('models unavailable'));

    const models = await codingPlanProviderType.getInitialModels!(
      { planId: 'qwen-plan' },
      { encryptedApiKey: 'coding-key' },
    );

    expect(models.map((model) => model.modelId)).toContain('qwen3.7-plus');
    expect(models.map((model) => model.modelId)).toContain('MiniMax-M2.5');
    expect(models.map((model) => model.modelId)).not.toContain('qwen3-32b');
  });
});
