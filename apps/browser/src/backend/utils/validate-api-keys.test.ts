import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CODING_PLANS, type CodingPlan } from '@shared/coding-plans';
import { generateText } from 'ai';
import { validateCodingPlanApiKey } from './validate-api-keys';

const openAiMock = vi.hoisted(() => ({
  chat: vi.fn((modelId: string) => ({ modelId })),
}));

const createOpenAIMock = vi.hoisted(() => vi.fn(() => openAiMock));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => ({ provider: 'anthropic' }))),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ provider: 'google' }))),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

const basePlan = {
  id: 'glm-coding-plan',
  provider: 'z-ai',
  displayName: 'GLM Coding Plan',
  tagline: 'GLM via Z.ai subscription',
  subscribeUrl: 'https://z.ai/subscribe',
  apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
  helpText: 'Create one at z.ai',
  featuredModelIds: ['glm-5.2'],
} satisfies CodingPlan;

describe('validateCodingPlanApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateText).mockResolvedValue({} as any);
  });

  it('uses dedicated validation metadata when both endpoint and model are set', async () => {
    const result = await validateCodingPlanApiKey(
      {
        ...basePlan,
        baseUrl: 'https://runtime.example/v1',
        validationBaseUrl: 'https://validation.example/v1',
        validationModelId: 'glm-validation',
      },
      'test-key',
    );

    expect(result).toEqual({ success: true });
    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://validation.example/v1',
    });
    expect(openAiMock.chat).toHaveBeenCalledWith('glm-validation');
  });

  it.each([
    ['qwen-plan', 'https://coding-intl.dashscope.aliyuncs.com/v1'],
    [
      'qwen-token-plan',
      'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    ],
  ] as const)('validates %s against its dedicated endpoint', async (planId, baseURL) => {
    const result = await validateCodingPlanApiKey(
      CODING_PLANS[planId],
      'test-key',
    );

    expect(result).toEqual({ success: true });
    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL,
    });
    expect(openAiMock.chat).toHaveBeenCalledWith('qwen3.7-plus');
  });

  it('prefers a custom instance endpoint for validation', async () => {
    const result = await validateCodingPlanApiKey(
      CODING_PLANS['qwen-token-plan'],
      'test-key',
      ' https://token-plan.eu.example.com/compatible-mode/v1/ ',
    );

    expect(result).toEqual({ success: true });
    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://token-plan.eu.example.com/compatible-mode/v1',
    });
  });

  it('rejects an invalid endpoint before making a request', async () => {
    const result = await validateCodingPlanApiKey(
      CODING_PLANS['qwen-token-plan'],
      'test-key',
      'http://token-plan.example.com/v1',
    );

    expect(result).toEqual({
      success: false,
      error: 'The API endpoint must use HTTPS.',
    });
    expect(createOpenAIMock).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('falls back to provider validation when custom validation metadata is incomplete', async () => {
    const result = await validateCodingPlanApiKey(
      {
        ...basePlan,
        baseUrl: 'https://runtime.example/v1',
      },
      'test-key',
    );

    expect(result).toEqual({ success: true });
    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://api.z.ai/api/paas/v4',
    });
    expect(openAiMock.chat).toHaveBeenCalledWith('glm-4.5-flash');
  });
});
