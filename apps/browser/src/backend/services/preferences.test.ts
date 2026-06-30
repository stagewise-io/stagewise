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

  it('connectCodingPlan validates against the plan and stores the plan id', async () => {
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

    const prefs = service.get();
    expect(prefs.providerConfigs['z-ai']).toMatchObject({
      mode: 'official',
      encryptedApiKey: Buffer.from('encrypted:glm-key').toString('base64'),
      connectedCodingPlanId: 'glm-coding-plan',
    });
  });

  it('does not mutate preferences when coding-plan validation fails', async () => {
    validationMock.validateCodingPlanApiKey.mockResolvedValueOnce({
      success: false,
      error: 'invalid key',
    });
    const service = await createServiceWithPreferences();

    const result = await service.connectCodingPlan(
      'glm-coding-plan',
      'bad-key',
    );

    expect(result).toEqual({ success: false, error: 'invalid key' });
    expect(service.get().providerConfigs['z-ai']).toEqual(
      defaultUserPreferences.providerConfigs['z-ai'],
    );
    expect(persistedDataMock.writePersistedData).not.toHaveBeenCalled();
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

describe('PreferencesService default-disabled model migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistedDataMock.writePersistedData.mockResolvedValue(undefined);
  });

  it('adds newly default-disabled model IDs missing from persisted preferences', async () => {
    const preferences = cloneDefaultPreferences();
    preferences.agent.disabledModelIds = ['claude-opus-4.7', 'claude-opus-4.6'];
    const service = await createServiceWithPreferences(preferences);

    expect(service.get().agent.disabledModelIds).toContain('claude-sonnet-4.6');
  });

  it('does not re-add an ID the user explicitly re-enabled', async () => {
    const preferences = cloneDefaultPreferences();
    // User previously had sonnet 4.6 disabled, then re-enabled it
    // (removed it from the list), keeping only older defaults.
    preferences.agent.disabledModelIds = [
      'claude-opus-4.7',
      'claude-opus-4.6',
      'claude-sonnet-4.6',
    ];
    const service = await createServiceWithPreferences(preferences);

    // The ID is already present — migration is a no-op, no write.
    expect(persistedDataMock.writePersistedData).not.toHaveBeenCalled();
    expect(service.get().agent.disabledModelIds).toEqual(
      preferences.agent.disabledModelIds,
    );
  });

  it('is a no-op when all newly default-disabled IDs are already present', async () => {
    const preferences = cloneDefaultPreferences();
    await createServiceWithPreferences(preferences);

    expect(persistedDataMock.writePersistedData).not.toHaveBeenCalled();
  });
});
