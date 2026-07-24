import { describe, expect, it, vi } from 'vitest';
import type { ModelWithOptions } from '../host/models';
import { ChatAgent } from './chat/chat';
import { ModelFallbackManager } from './model-fallback-manager';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type RunStepInternals = {
  _stepGeneration: number;
  _stepProviderMode: string;
  _stepCodingPlanId: string | undefined;
  _stepProviderType: string | undefined;
  runStep: () => Promise<void>;
  applyStepProviderMetadataIfCurrent: (
    modelWithOptions: ModelWithOptions,
    stepGeneration: number,
  ) => void;
  host: {
    models: { getWithOptions: () => Promise<ModelWithOptions> };
    logger: {
      error: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      debug: ReturnType<typeof vi.fn>;
    };
  };
  state: {
    get: ReturnType<typeof vi.fn>;
    commands: {
      beginStep: ReturnType<typeof vi.fn>;
      recordStepError: ReturnType<typeof vi.fn>;
    };
  };
  [key: string]: any;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function providerMetadata(
  providerMode: string,
  connectedCodingPlanId: string | undefined,
  providerType: string | undefined,
): ModelWithOptions {
  return {
    providerMode,
    connectedCodingPlanId,
    providerType,
  } as ModelWithOptions;
}

function createStubAgent(
  getWithOptions: () => Promise<ModelWithOptions>,
): RunStepInternals {
  const agent = Object.create(ChatAgent.prototype) as RunStepInternals;
  agent._stepGeneration = 0;
  agent._stepProviderMode = 'current-mode';
  agent._stepCodingPlanId = 'current-plan';
  agent._stepProviderType = 'current-provider';
  agent._fallbackManager = new ModelFallbackManager();
  agent.canRunStep = vi.fn().mockReturnValue(true);
  agent.generateContextForNewStep = vi.fn();
  agent.getToolsForStep = vi.fn();
  agent.getModelSettings = vi.fn();
  agent.report = vi.fn();
  agent.emitNotificationEvent = vi.fn();
  agent.scheduleMemorySnapshotWrite = vi.fn();
  agent.state = {
    get: vi.fn().mockReturnValue({
      activeModelId: 'test-model',
      activeProviderInstanceId: 'test-provider',
      history: [],
    }),
    commands: {
      beginStep: vi.fn().mockReturnValue({ queueFlushIndex: undefined }),
      recordStepError: vi.fn(),
      setActiveModel: vi.fn(),
    },
  };
  agent.host = {
    models: { getWithOptions },
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
  return agent;
}

describe('BaseAgent step provider metadata', () => {
  it('ignores metadata resolved for a superseded step generation', () => {
    const agent = createStubAgent(vi.fn());
    agent._stepGeneration = 2;

    agent.applyStepProviderMetadataIfCurrent(
      providerMetadata('stale-mode', 'stale-plan', 'stale-provider'),
      1,
    );

    expect(agent._stepProviderMode).toBe('current-mode');
    expect(agent._stepCodingPlanId).toBe('current-plan');
    expect(agent._stepProviderType).toBe('current-provider');
  });

  it('updates the complete metadata tuple for the current generation', () => {
    const agent = createStubAgent(vi.fn());
    agent._stepGeneration = 2;

    agent.applyStepProviderMetadataIfCurrent(
      providerMetadata('next-mode', undefined, 'next-provider'),
      2,
    );

    expect(agent._stepProviderMode).toBe('next-mode');
    expect(agent._stepCodingPlanId).toBeUndefined();
    expect(agent._stepProviderType).toBe('next-provider');
  });
});

describe('BaseAgent stale step preparation', () => {
  it('stops after a model lookup resolves for a superseded generation', async () => {
    const lookup = deferred<ModelWithOptions>();
    const agent = createStubAgent(() => lookup.promise);

    const run = agent.runStep();
    agent._stepGeneration += 1;
    lookup.resolve(providerMetadata('stale', undefined, 'stale-provider'));
    await run;

    expect(agent.generateContextForNewStep).not.toHaveBeenCalled();
  });

  it('silently ignores a model lookup rejection after supersession', async () => {
    const lookup = deferred<ModelWithOptions>();
    const agent = createStubAgent(() => lookup.promise);

    const run = agent.runStep();
    agent._stepGeneration += 1;
    lookup.reject(new Error('stale lookup failure'));
    await run;

    expect(agent.host.logger.error).not.toHaveBeenCalled();
    expect(agent.report).not.toHaveBeenCalled();
    expect(agent.state.commands.recordStepError).not.toHaveBeenCalled();
  });

  it('stops after context generation when the generation is superseded', async () => {
    const context = deferred<never[]>();
    const agent = createStubAgent(() =>
      Promise.resolve(providerMetadata('official', undefined, 'openai-api')),
    );
    agent.generateContextForNewStep = vi.fn(() => context.promise);

    const run = agent.runStep();
    await vi.waitFor(() =>
      expect(agent.generateContextForNewStep).toHaveBeenCalledOnce(),
    );
    agent._stepGeneration += 1;
    context.resolve([]);
    await run;

    expect(agent.getToolsForStep).not.toHaveBeenCalled();
    expect(agent.getModelSettings).not.toHaveBeenCalled();
    expect(agent.stepAbortController).toBeUndefined();
  });
});
