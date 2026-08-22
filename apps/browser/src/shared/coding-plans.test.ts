import { describe, expect, it } from 'vitest';
import {
  CODING_PLANS,
  resolveCodingPlanBaseUrl,
  resolveCodingPlanValidationBaseUrl,
  validateCodingPlanBaseUrl,
} from './coding-plans';

describe('coding plan endpoint helpers', () => {
  const tokenPlan = CODING_PLANS['qwen-token-plan'];

  it('resolves the plan defaults', () => {
    expect(resolveCodingPlanBaseUrl(tokenPlan)).toBe(tokenPlan.baseUrl);
    expect(resolveCodingPlanValidationBaseUrl(tokenPlan)).toBe(
      tokenPlan.validationBaseUrl,
    );
  });

  it('normalizes and prefers an explicit endpoint', () => {
    const explicit = '  https://token-plan.example.com/compatible-mode/v1/// ';
    expect(resolveCodingPlanBaseUrl(tokenPlan, explicit)).toBe(
      'https://token-plan.example.com/compatible-mode/v1',
    );
    expect(resolveCodingPlanValidationBaseUrl(tokenPlan, explicit)).toBe(
      'https://token-plan.example.com/compatible-mode/v1',
    );
  });

  it.each([
    ['http://example.com/v1', 'must use HTTPS'],
    ['https://user:password@example.com/v1', 'must not contain credentials'],
    ['https://example.com/v1?region=eu', 'must not contain a query string'],
    ['https://example.com/v1#region', 'must not contain a query string'],
    ['not-a-url', 'valid absolute URL'],
  ])('rejects unsafe endpoint %s', (value, error) => {
    expect(validateCodingPlanBaseUrl(value)).toEqual({
      success: false,
      error: expect.stringContaining(error),
    });
  });
});

describe('opencode-go plan', () => {
  const plan = CODING_PLANS['opencode-go'];

  it('is registered', () => {
    expect(plan.id).toBe('opencode-go');
    expect(plan.provider).toBe('opencode');
  });

  it('routes through the Go subscription endpoint with a validation model', () => {
    expect(resolveCodingPlanBaseUrl(plan)).toBe(
      'https://opencode.ai/zen/go/v1',
    );
    expect(resolveCodingPlanValidationBaseUrl(plan)).toBe(
      'https://opencode.ai/zen/go/v1',
    );
    expect(plan.validationModelId).toBe('mimo-v2.5');
  });

  it('curates featured models and relies on live model discovery', () => {
    expect(plan.featuredModelIds).toContain('glm-5.2');
    // The Go endpoint serves /models, so no documented fallback is needed.
    expect(plan.fallbackModelIds).toBeUndefined();
  });
});
