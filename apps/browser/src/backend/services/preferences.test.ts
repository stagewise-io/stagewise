import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultUserPreferences } from '@shared/karton-contracts/ui/shared-types';
import { PreferencesService } from './preferences';

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
  });
});
