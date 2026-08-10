import { describe, expect, it } from 'vitest';
import { parseOpenCodeModels } from './provider';

describe('OpenCode model discovery', () => {
  it('maps verbose CLI output to discovered models', () => {
    const models = parseOpenCodeModels(`opencode-go/gpt-5.6-luna
{
  "providerID": "opencode-go",
  "name": "GPT-5.6 Luna (2x usage)",
  "cost": { "input": 0.1, "output": 0.6 },
  "limit": { "context": 1050000 },
  "capabilities": {
    "reasoning": true,
    "attachment": true,
    "toolcall": true,
    "input": { "text": true, "image": true, "pdf": true },
    "output": { "text": true }
  },
  "variants": { "low": {}, "medium": {}, "high": {} }
}
opencode/deepseek-v4-flash-free
{
  "providerID": "opencode",
  "name": "DeepSeek V4 Flash Free",
  "limit": { "context": 200000 },
  "capabilities": { "reasoning": true, "toolcall": true },
  "variants": {}
}`);

    expect(models).toMatchObject([
      {
        modelId: 'opencode-go/gpt-5.6-luna',
        displayName: 'GPT-5.6 Luna (2x usage) · OpenCode Go',
        contextWindow: 1_050_000,
        pricing: { inputPerMillion: 0.1, outputPerMillion: 0.6 },
        capabilities: {
          inputModalities: { image: true, file: true },
          toolCalling: true,
        },
        thinkingEnabled: true,
        thinkingEfforts: ['low', 'medium', 'high'],
        defaultThinkingEffort: 'medium',
      },
      {
        modelId: 'opencode/deepseek-v4-flash-free',
        displayName: 'DeepSeek V4 Flash Free · OpenCode Zen',
        contextWindow: 200_000,
      },
    ]);
  });
});
