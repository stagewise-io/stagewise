import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultUserPreferences } from '@shared/karton-contracts/ui/shared-types';
import { PreferencesService } from './preferences';
import { CODING_PLANS } from '@shared/coding-plans';

vi.hoisted(() => {
  vi.stubGlobal('__APP_BASE_NAME__', 'stagewise-test');
  vi.stubGlobal('__APP_NAME__', 'stagewise-test');
  vi.stubGlobal('__APP_BUNDLE_ID__', 'io.stagewise.test');
  vi.stubGlobal('__APP_VERSION__', '0.0.0-test');
  vi.stubGlobal('__APP_PLATFORM__', 'darwin');
  vi.stubGlobal('__APP_RELEASE_CHANNEL__', 'test');
  vi.stubGlobal('__APP_AUTHOR__', 'stagewise');
  vi.stubGlobal('__APP_COPYRIGHT__', 'stagewise');
  vi.stubGlobal('__APP_HOMEPAGE__', 'https://stagewise.io');
  vi.stubGlobal('__APP_ARCH__', 'arm64');
});

const electronMock = vi.hoisted(() => ({
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
  decryptString: vi.fn((buffer: Buffer) =>
    buffer.toString('utf-8').replace(/^encrypted:/, ''),
  ),
  isEncryptionAvailable: vi.fn(() => true),
}));

vi.mock('electron', () => ({
  safeStorage: electronMock,
}));

const persistedDataMock = vi.hoisted(() => ({
  readPersistedData: vi.fn(),
  writePersistedData: vi.fn(),
}));

vi.mock('../utils/persisted-data', () => persistedDataMock);

const validationMock = vi.hoisted(() => ({
  validateApiKeys: vi.fn(),
  validateCodingPlanApiKey: vi.fn(),
}));

vi.mock('../utils/validate-api-keys', () => validationMock);

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

function cloneDefaultPreferences() {
  return structuredClone(defaultUserPreferences);
}

async function createServiceWithPreferences(
  preferences = cloneDefaultPreferences(),
) {
  persistedDataMock.readPersistedData.mockResolvedValueOnce(preferences);
  const service = await PreferencesService.create(logger as any);
  return service;
}

describe('PreferencesService provider instance names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedDataMock.writePersistedData.mockResolvedValue(undefined);
  });

  it('numbers implicitly named provider instances and reuses available suffixes', async () => {
    const service = await createServiceWithPreferences();

    const first = await service.addProviderInstance({
      typeId: 'openai-api',
      config: {},
    });
    const second = await service.addProviderInstance({
      typeId: 'openai-api',
      config: {},
    });
    const third = await service.addProviderInstance({
      typeId: 'openai-api',
      config: {},
    });

    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ success: true });
    expect(third).toMatchObject({ success: true });
    expect(
      service.get().providerInstances.map((instance) => instance.name),
    ).toEqual([
      'Stagewise Inference',
      'OpenAI API',
      'OpenAI API (2)',
      'OpenAI API (3)',
    ]);

    await service.removeProviderInstance(
      (second as { instanceId: string }).instanceId,
    );
    await service.addProviderInstance({ typeId: 'openai-api', config: {} });

    expect(
      service
        .get()
        .providerInstances.filter(
          (instance) => instance.typeId === 'openai-api',
        )
        .map((instance) => instance.name),
    ).toEqual(['OpenAI API', 'OpenAI API (3)', 'OpenAI API (2)']);
  });

  it('preserves explicit provider instance names', async () => {
    const service = await createServiceWithPreferences();

    const result = await service.addProviderInstance({
      typeId: 'openai-api',
      name: 'Production OpenAI',
      config: {},
    });

    expect(result).toMatchObject({ success: true });
    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        typeId: 'openai-api',
        name: 'Production OpenAI',
      }),
    );
  });
});

describe('PreferencesService provider instance deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedDataMock.writePersistedData.mockResolvedValue(undefined);
  });

  it('removes dependent custom models and thinking overrides atomically', async () => {
    const preferences = cloneDefaultPreferences();
    const result = await createServiceWithPreferences(preferences);
    const added = await result.addProviderInstance({
      typeId: 'custom-openai-chat',
      config: { baseUrl: 'https://example.com/v1' },
    });
    const instanceId = (added as { instanceId: string }).instanceId;
    await result.update([
      {
        op: 'add',
        path: ['customModels', 0],
        value: {
          modelId: 'custom-model',
          displayName: 'Custom Model',
          providerInstanceId: instanceId,
        },
      },
      {
        op: 'add',
        path: ['agent', 'modelThinkingOverrides', instanceId],
        value: { 'custom-model': { enabled: true } },
      },
    ]);

    await result.removeProviderInstance(instanceId);

    expect(result.get().providerInstances).not.toContainEqual(
      expect.objectContaining({ id: instanceId }),
    );
    expect(result.get().customModels).toEqual([]);
    expect(result.get().agent.modelThinkingOverrides).not.toHaveProperty(
      instanceId,
    );
  });

  it('keeps unrelated preference records when deleting an instance', async () => {
    const service = await createServiceWithPreferences();
    const first = await service.addProviderInstance({
      typeId: 'openai-api',
      config: {},
    });
    const second = await service.addProviderInstance({
      typeId: 'anthropic-api',
      config: {},
    });

    await service.removeProviderInstance(
      (first as { instanceId: string }).instanceId,
    );

    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: (second as { instanceId: string }).instanceId,
      }),
    );
  });

  it('rejects deletion of the built-in Stagewise instance', async () => {
    const service = await createServiceWithPreferences();

    await expect(
      service.removeProviderInstance('stagewise-default'),
    ).rejects.toThrow('cannot be removed');
  });
});

describe('PreferencesService provider instance type replacements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedDataMock.writePersistedData.mockResolvedValue(undefined);
  });

  it('atomically replaces the provider type and drops incompatible config fields', async () => {
    const service = await createServiceWithPreferences();
    const added = await service.addProviderInstance({
      typeId: 'custom-openai-chat',
      config: {
        baseUrl: 'https://example.com/v1',
        encryptedApiKey: 'encrypted-api-key',
      },
    });
    const instanceId = (added as { instanceId: string }).instanceId;

    await service.updateProviderInstance(
      instanceId,
      { region: 'us-east-1' },
      'Bedrock endpoint',
      'bedrock',
    );

    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: instanceId,
        typeId: 'bedrock',
        name: 'Bedrock endpoint',
        config: {
          region: 'us-east-1',
          encryptedApiKey: 'encrypted-api-key',
          awsAuthMode: 'access-keys',
        },
      }),
    );
  });
});

describe('PreferencesService legacy provider migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedDataMock.writePersistedData.mockResolvedValue(undefined);
  });

  it('migrates official keys, custom endpoints and models, disabled models, and every coding plan idempotently', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.providerConfigs.openai = {
      ...preferences.providerConfigs.openai,
      mode: 'official',
      encryptedApiKey: 'openai-key',
    };
    preferences.providerConfigs.anthropic = {
      ...preferences.providerConfigs.anthropic,
      mode: 'custom',
      customProviderId: 'custom-anthropic',
    };
    preferences.customEndpoints = [
      {
        id: 'custom-anthropic',
        name: 'Custom Anthropic',
        apiSpec: 'anthropic',
        baseUrl: 'https://anthropic.example.com',
        encryptedApiKey: 'custom-key',
        awsAuthMode: 'access-keys',
      },
    ];
    preferences.customModels = [
      {
        modelId: 'custom-model',
        displayName: 'Custom Model',
        description: '',
        contextWindowSize: 128_000,
        endpointId: 'custom-anthropic',
        thinkingEnabled: false,
        capabilities: {
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
          toolCalling: true,
        },
        providerOptions: {},
        headers: {},
      },
    ];
    for (const plan of Object.values(CODING_PLANS)) {
      preferences.providerConfigs[plan.provider] = {
        ...preferences.providerConfigs[plan.provider],
        mode: 'official',
        connectedCodingPlanId: plan.id,
        encryptedApiKey: `${plan.id}-key`,
      };
    }

    const service = await createServiceWithPreferences(preferences);
    const instances = service.get().providerInstances;

    expect(instances).toContainEqual(
      expect.objectContaining({
        id: 'openai-api-default',
        typeId: 'openai-api',
        config: expect.objectContaining({ encryptedApiKey: 'openai-key' }),
      }),
    );
    expect(instances).toContainEqual(
      expect.objectContaining({
        id: 'custom-anthropic',
        typeId: 'custom-anthropic',
        config: expect.objectContaining({
          baseUrl: 'https://anthropic.example.com',
        }),
      }),
    );
    expect(service.get().customModels).toContainEqual(
      expect.objectContaining({
        modelId: 'custom-model',
        providerInstanceId: 'custom-anthropic',
        endpointId: undefined,
      }),
    );
    for (const plan of Object.values(CODING_PLANS)) {
      expect(
        instances.filter(
          (instance) =>
            instance.typeId === 'coding-plan' &&
            instance.config.planId === plan.id,
        ),
      ).toHaveLength(1);
    }

    persistedDataMock.readPersistedData.mockResolvedValueOnce(service.get());
    const repeated = await PreferencesService.create(logger as any);
    expect(repeated.get().providerInstances).toHaveLength(instances.length);
    expect(persistedDataMock.writePersistedData).toHaveBeenCalledTimes(1);
  });

  it('reconciles a legacy coding plan when provider instances already exist', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.providerInstances = [
      {
        id: 'stagewise-default',
        typeId: 'stagewise',
        name: 'Stagewise Inference',
        config: {},
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];
    preferences.providerConfigs['z-ai'] = {
      ...preferences.providerConfigs['z-ai'],
      mode: 'official',
      encryptedApiKey: 'legacy-key',
      connectedCodingPlanId: 'glm-coding-plan',
    };

    const service = await createServiceWithPreferences(preferences);

    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: 'coding-plan:glm-coding-plan',
        config: expect.objectContaining({ planId: 'glm-coding-plan' }),
      }),
    );
  });
});

describe('PreferencesService coding plan connection state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedDataMock.writePersistedData.mockResolvedValue(undefined);
    validationMock.validateApiKeys.mockResolvedValue({
      anthropic: null,
      openai: null,
      google: null,
      moonshotai: null,
      alibaba: null,
      deepseek: null,
      'z-ai': { success: true },
      minimax: null,
    });
    validationMock.validateCodingPlanApiKey.mockResolvedValue({
      success: true,
    });
  });

  it('connectCodingPlan delegates to an instance-backed coding-plan connection', async () => {
    const service = await createServiceWithPreferences();

    const result = await service.connectCodingPlan(
      'glm-coding-plan',
      'glm-key',
    );

    expect(result).toEqual({ success: true });
    expect(validationMock.validateCodingPlanApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'glm-coding-plan',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        validationBaseUrl: 'https://api.z.ai/api/coding/paas/v4',
        validationModelId: 'glm-5.2',
      }),
      'glm-key',
    );
    expect(validationMock.validateApiKeys).not.toHaveBeenCalled();

    const instance = service
      .get()
      .providerInstances.find(
        (candidate) =>
          candidate.typeId === 'coding-plan' &&
          candidate.config.planId === 'glm-coding-plan',
      );
    expect(instance).toMatchObject({
      typeId: 'coding-plan',
      name: 'GLM Coding Plan',
      config: {
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        encryptedApiKey: Buffer.from('encrypted:glm-key').toString('base64'),
        planId: 'glm-coding-plan',
      },
    });
    expect(instance?.id).toMatch(/^coding-plan-/);
    expect(service.get().providerConfigs['z-ai']).toEqual(
      defaultUserPreferences.providerConfigs['z-ai'],
    );
  });

  it('does not mutate preferences when coding-plan validation fails', async () => {
    validationMock.validateCodingPlanApiKey.mockResolvedValueOnce({
      success: false,
      error: 'invalid key',
    });
    const service = await createServiceWithPreferences();
    // The migration during initialize() writes once; clear it so the
    // assertion below verifies that the failed connectCodingPlan does
    // not trigger an additional write.
    persistedDataMock.writePersistedData.mockClear();

    const result = await service.connectCodingPlan(
      'glm-coding-plan',
      'bad-key',
    );

    expect(result).toEqual({ success: false, error: 'invalid key' });
    expect(service.get().providerInstances).not.toContainEqual(
      expect.objectContaining({
        typeId: 'coding-plan',
        config: expect.objectContaining({ planId: 'glm-coding-plan' }),
      }),
    );
    expect(persistedDataMock.writePersistedData).not.toHaveBeenCalled();
  });

  it('migrates legacy coding-plan connections after provider instances exist', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.providerInstances = [
      {
        id: 'stagewise-default',
        typeId: 'stagewise',
        name: 'Stagewise Inference',
        config: {},
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];
    preferences.providerConfigs['z-ai'] = {
      ...preferences.providerConfigs['z-ai'],
      mode: 'official',
      encryptedApiKey: 'legacy-encrypted-key',
      connectedCodingPlanId: 'glm-coding-plan',
    };

    const service = await createServiceWithPreferences(preferences);

    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: 'coding-plan:glm-coding-plan',
        typeId: 'coding-plan',
        config: expect.objectContaining({
          encryptedApiKey: 'legacy-encrypted-key',
          planId: 'glm-coding-plan',
          baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        }),
      }),
    );
  });

  it('connectProvider clears stale coding-plan routing state', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.providerConfigs['z-ai'] = {
      ...preferences.providerConfigs['z-ai'],
      mode: 'official',
      encryptedApiKey: 'old-encrypted-key',
      connectedCodingPlanId: 'glm-coding-plan',
    };
    const service = await createServiceWithPreferences(preferences);

    const result = await service.connectProvider('z-ai', 'normal-zai-key');

    expect(result).toEqual({ success: true });
    expect(validationMock.validateApiKeys).toHaveBeenCalledWith({
      'z-ai': 'normal-zai-key',
    });
    expect(service.get().providerConfigs['z-ai']).toMatchObject({
      mode: 'official',
      encryptedApiKey: Buffer.from('encrypted:normal-zai-key').toString(
        'base64',
      ),
      connectedCodingPlanId: undefined,
    });
    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: 'z-ai-api-default',
        typeId: 'z-ai-api',
        config: expect.objectContaining({
          encryptedApiKey: Buffer.from('encrypted:normal-zai-key').toString(
            'base64',
          ),
        }),
      }),
    );
    expect(service.get().providerInstances).not.toContainEqual(
      expect.objectContaining({
        typeId: 'coding-plan',
        config: expect.objectContaining({ planId: 'glm-coding-plan' }),
      }),
    );
  });

  it('setProviderApiKey clears stale coding-plan routing state', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.providerConfigs['z-ai'] = {
      ...preferences.providerConfigs['z-ai'],
      mode: 'official',
      encryptedApiKey: 'old-encrypted-key',
      connectedCodingPlanId: 'glm-coding-plan',
    };
    const service = await createServiceWithPreferences(preferences);

    await service.setProviderApiKey('z-ai', 'manual-key');

    expect(service.get().providerConfigs['z-ai']).toMatchObject({
      mode: 'official',
      encryptedApiKey: Buffer.from('encrypted:manual-key').toString('base64'),
      connectedCodingPlanId: undefined,
    });
    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: 'z-ai-api-default',
        typeId: 'z-ai-api',
        config: expect.objectContaining({
          encryptedApiKey: Buffer.from('encrypted:manual-key').toString(
            'base64',
          ),
        }),
      }),
    );
  });

  it('disconnectProvider clears stale coding-plan routing state', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.providerConfigs['z-ai'] = {
      ...preferences.providerConfigs['z-ai'],
      mode: 'official',
      encryptedApiKey: 'old-encrypted-key',
      connectedCodingPlanId: 'glm-coding-plan',
    };
    const service = await createServiceWithPreferences(preferences);

    await service.disconnectProvider('z-ai');

    expect(service.get().providerConfigs['z-ai']).toMatchObject({
      mode: 'stagewise',
      encryptedApiKey: undefined,
      connectedCodingPlanId: undefined,
    });
    expect(service.get().providerInstances).not.toContainEqual(
      expect.objectContaining({ id: 'z-ai-api-default' }),
    );
    expect(service.get().providerInstances).not.toContainEqual(
      expect.objectContaining({
        typeId: 'coding-plan',
        config: expect.objectContaining({ planId: 'glm-coding-plan' }),
      }),
    );
  });

  it('clears only canonical legacy routing instances', async () => {
    const service = await createServiceWithPreferences();
    const alternate = await service.addProviderInstance({
      typeId: 'openai-api',
      name: 'Alternate OpenAI',
      config: { encryptedApiKey: 'alternate-key' },
    });

    await service.setProviderApiKey('openai', 'legacy-key');
    await service.clearProviderApiKey('openai');

    expect(service.get().providerInstances).toContainEqual(
      expect.objectContaining({
        id: (alternate as { instanceId: string }).instanceId,
        name: 'Alternate OpenAI',
      }),
    );
    expect(service.get().providerInstances).not.toContainEqual(
      expect.objectContaining({ id: 'openai-api-default' }),
    );
  });
});
