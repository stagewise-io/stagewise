import { describe, expect, it } from 'vitest';
import { getSemanticProviderForApiSpec } from './api-spec-provider';

describe('getSemanticProviderForApiSpec', () => {
  it.each([
    ['anthropic', 'anthropic'],
    ['amazon-bedrock', 'anthropic'],
    ['google', 'google'],
    ['google-vertex', 'google'],
    ['openai-chat-completions', 'openai'],
    ['openai-responses', 'openai'],
    ['azure', 'openai'],
  ] as const)('maps %s semantics to %s', (apiSpec, provider) => {
    expect(getSemanticProviderForApiSpec(apiSpec)).toBe(provider);
  });
});
