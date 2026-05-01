import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ModelProviderService } from '@/agents/model-provider';
import type { TelemetryService } from '@/services/telemetry';

// ---------------------------------------------------------------------------
// Mock `ai` module — must be before the import of the module under test
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

// We import *after* vi.mock so vitest can intercept
import { generateObject } from 'ai';
import { classifyShellCommand, type ClassifyShellCommandInput } from './index';

const generateObjectMock = vi.mocked(generateObject);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModelProviderService(): ModelProviderService {
  return {
    getModelWithOptions: vi.fn().mockReturnValue({
      model: { id: 'mock-model' },
      providerOptions: {},
      headers: {},
      contextWindowSize: 100_000,
      providerMode: 'stagewise',
    }),
  } as unknown as ModelProviderService;
}

function makeMockTelemetryService(): TelemetryService {
  return {
    capture: vi.fn(),
    captureException: vi.fn(),
  } as unknown as TelemetryService;
}

const baseInput: ClassifyShellCommandInput = {
  command: 'ls -la',
  cwdPrefix: 'weba9',
  agentExplanation: 'List files',
  shellTail: '',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classifyShellCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateObjectMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the classifier result from the first model on success', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        needsApproval: false,
        explanation: 'Read-only listing inside the mounted workspace.',
      },
    } as any);

    const mps = makeMockModelProviderService();
    const telemetry = makeMockTelemetryService();
    const result = await classifyShellCommand(
      baseInput,
      mps,
      'agent-1',
      telemetry,
    );

    expect(result).toEqual({
      needsApproval: false,
      explanation: 'Read-only listing inside the mounted workspace.',
    });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(mps.getModelWithOptions).toHaveBeenCalledWith(
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.objectContaining({
        $ai_span_name: 'smart-approval-classification',
      }),
    );
    expect(telemetry.capture).toHaveBeenCalledWith(
      'smart-approval-classified',
      expect.objectContaining({
        needs_approval: false,
        model_id: 'gemini-3.1-flash-lite-preview',
        fallback_index: 0,
      }),
    );
  });

  it('falls back to the second model when the first fails', async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockResolvedValueOnce({
        object: {
          needsApproval: true,
          explanation: 'Force-push rewrites remote history.',
        },
      } as any);

    const mps = makeMockModelProviderService();
    const telemetry = makeMockTelemetryService();
    const result = await classifyShellCommand(
      baseInput,
      mps,
      'agent-1',
      telemetry,
    );

    expect(result.needsApproval).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
    expect(telemetry.capture).toHaveBeenLastCalledWith(
      'smart-approval-classified',
      expect.objectContaining({
        model_id: 'gpt-5.4-nano',
        fallback_index: 1,
      }),
    );
  });

  it('fails closed with a classifier-unavailable explanation when all models fail', async () => {
    const err = new Error('network');
    generateObjectMock
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err);

    const mps = makeMockModelProviderService();
    const telemetry = makeMockTelemetryService();
    const result = await classifyShellCommand(
      baseInput,
      mps,
      'agent-1',
      telemetry,
    );

    expect(result.needsApproval).toBe(true);
    expect(result.explanation).toMatch(/classifier unavailable/i);
    expect(generateObjectMock).toHaveBeenCalledTimes(3);
    expect(telemetry.capture).toHaveBeenLastCalledWith(
      'smart-approval-classified',
      expect.objectContaining({
        needs_approval: true,
        model_id: 'failed',
      }),
    );
  });

  it('passes an abortSignal to generateObject', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { needsApproval: false, explanation: 'Safe command.' },
    } as any);

    const mps = makeMockModelProviderService();
    const telemetry = makeMockTelemetryService();
    await classifyShellCommand(baseInput, mps, 'agent-1', telemetry);

    const callArgs = generateObjectMock.mock.calls[0][0] as any;
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('disables anthropic thinking via providerOptions', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { needsApproval: false, explanation: 'Safe command.' },
    } as any);

    const mps = makeMockModelProviderService();
    const telemetry = makeMockTelemetryService();
    await classifyShellCommand(baseInput, mps, 'agent-1', telemetry);

    const callArgs = generateObjectMock.mock.calls[0][0] as any;
    expect(callArgs.providerOptions).toMatchObject({
      anthropic: { thinking: { type: 'disabled' } },
    });
  });

  it('includes different shell tails in separate classifier calls', async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: { needsApproval: false, explanation: 'Safe confirmation.' },
      } as any)
      .mockResolvedValueOnce({
        object: {
          needsApproval: true,
          explanation: 'Confirms a destructive prompt.',
        },
      } as any);

    const mps = makeMockModelProviderService();
    const telemetry = makeMockTelemetryService();

    const first = await classifyShellCommand(
      { ...baseInput, command: 'y', shellTail: 'Continue? (y/n)' },
      mps,
      'agent-1',
      telemetry,
    );
    const second = await classifyShellCommand(
      {
        ...baseInput,
        command: 'y',
        shellTail: 'Delete file? [y/N]',
      },
      mps,
      'agent-1',
      telemetry,
    );

    // Different tails are sent as separate classifier calls.
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(first.needsApproval).toBe(false);
    expect(second.needsApproval).toBe(true);
  });
});
