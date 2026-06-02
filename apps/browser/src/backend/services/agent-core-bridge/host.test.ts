import { describe, expect, it, vi } from 'vitest';
import { AgentTypes, type Logger } from '@stagewise/agent-core';
import {
  AGENTS_MD_DOMAIN_ID,
  ENABLED_SKILLS_DOMAIN_ID,
  FILE_DIFFS_DOMAIN_ID,
  PLANS_DOMAIN_ID,
  WORKSPACE_DOMAIN_ID,
} from '@stagewise/agent-core/env/adapters';
// See host.ts for why we bypass the `@/env-domains` barrel here.
import { ACTIVE_APP_DOMAIN_ID } from '@/env-domains/active-app-domain-adapter';
import { BROWSER_DOMAIN_ID } from '@/env-domains/browser-domain-adapter';
import { LOG_INGEST_DOMAIN_ID } from '@/env-domains/log-ingest-domain-adapter';
import { SANDBOX_DOMAIN_ID } from '@/env-domains/sandbox-domain-adapter';
import { SHELLS_DOMAIN_ID } from '@/env-domains/shells-domain-adapter';
import type { ModelProviderService } from '@/agents/model-provider';
import type { Logger as BrowserLogger } from '@/services/logger';
import type { TelemetryService, UIEventName } from '@/services/telemetry';
import { createBrowserAgentHost } from './host';
import { createBrowserHostModels } from './host-models';
import { createBrowserHostPaths } from './host-paths';
import { createBrowserTelemetrySink } from './host-telemetry';

// `apps/browser/src/backend/utils/paths.ts` imports `electron`. Stub
// the module at the vitest mock layer so the Electron-free adapter
// tests can verify delegation without a real Electron runtime.
vi.mock('@/utils/paths', () => ({
  getDataRoot: () => '/tmp/data',
  getTempRoot: () => '/tmp/temp',
  getAgentsDir: () => '/tmp/data/agents',
  getAgentDir: (id: string) => `/tmp/data/agents/${id}`,
  getAgentAttachmentsDir: (id: string) =>
    `/tmp/data/agents/${id}/data-attachments`,
  getAgentAttachmentPath: (id: string, attId: string) =>
    `/tmp/data/agents/${id}/data-attachments/${attId}`,
  getAgentAppsDir: (id: string) => `/tmp/data/agents/${id}/apps`,
  getAgentShellLogsDir: (id: string) => `/tmp/data/agents/${id}/shell-logs`,
  getDiffHistoryDir: () => '/tmp/data/diff-history',
  getDiffHistoryDbPath: () => '/tmp/data/diff-history/data.sqlite',
  getDiffHistoryBlobsDir: () => '/tmp/data/diff-history/data-blobs',
  getAgentDbPath: () => '/tmp/data/agents/instances.sqlite',
  getDbPath: (name: string) => `/tmp/data/${name}.sqlite`,
  getUserDataDir: () => '/tmp/data/user-data',
  getPlansDir: () => '/tmp/data/user-data/plans',
  getLogsDir: () => '/tmp/data/user-data/logs',
  getPluginsPath: () => '/tmp/plugins',
  getBuiltinSkillsPath: () => '/tmp/skills',
  getRipgrepBasePath: () => '/tmp/data/bin',
}));

function makeLogger(): Logger & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('createBrowserHostPaths', () => {
  it('delegates each method to @/utils/paths', () => {
    const paths = createBrowserHostPaths();

    expect(paths.dataDir()).toBe('/tmp/data');
    expect(paths.tempDir()).toBe('/tmp/temp');
    expect(paths.agentsDir()).toBe('/tmp/data/agents');
    expect(paths.agentDir('a1')).toBe('/tmp/data/agents/a1');
    expect(paths.agentAttachmentsDir('a1')).toBe(
      '/tmp/data/agents/a1/data-attachments',
    );
    expect(paths.agentAttachmentPath('a1', 'att')).toBe(
      '/tmp/data/agents/a1/data-attachments/att',
    );
    expect(paths.agentAppsDir('a1')).toBe('/tmp/data/agents/a1/apps');
    expect(paths.agentShellLogsDir('a1')).toBe(
      '/tmp/data/agents/a1/shell-logs',
    );
    expect(paths.diffHistoryDir()).toBe('/tmp/data/diff-history');
    expect(paths.diffHistoryDbPath()).toBe(
      '/tmp/data/diff-history/data.sqlite',
    );
    expect(paths.diffHistoryBlobsDir()).toBe(
      '/tmp/data/diff-history/data-blobs',
    );
    expect(paths.agentDbPath()).toBe('/tmp/data/agents/instances.sqlite');
    expect(paths.fileReadCacheDbPath()).toBe(
      '/tmp/data/file-read-cache.sqlite',
    );
    expect(paths.processedImageCacheDbPath()).toBe(
      '/tmp/data/processed-image-cache.sqlite',
    );
    expect(paths.userDataDir()).toBe('/tmp/data/user-data');
    expect(paths.plansDir()).toBe('/tmp/data/user-data/plans');
    expect(paths.logsDir()).toBe('/tmp/data/user-data/logs');
    expect(paths.pluginsDir()).toBe('/tmp/plugins');
    expect(paths.builtinSkillsDir()).toBe('/tmp/skills');
    expect(paths.ripgrepBaseDir()).toBe('/tmp/data/bin');
  });
});

describe('createBrowserHostModels', () => {
  it('delegates get() to getModelWithOptions and returns the model', async () => {
    const fakeModel = { __brand: 'language-model' };
    const mp = {
      modelExists: vi.fn(() => true),
      getModelWithOptions: vi.fn(() => ({
        model: fakeModel,
        providerOptions: undefined,
        headers: {},
        contextWindowSize: 128_000,
        providerMode: 'stagewise',
      })),
    };

    const models = createBrowserHostModels(
      mp as unknown as ModelProviderService,
    );
    const result = await models.get('claude-x', 'trace-1');

    expect(mp.getModelWithOptions).toHaveBeenCalledWith(
      'claude-x',
      'trace-1',
      undefined,
    );
    expect(result).toBe(fakeModel);
  });

  it('getWithOptions returns the full ModelWithOptions payload', async () => {
    const fakeModel = { __brand: 'language-model' };
    const full = {
      model: fakeModel,
      providerOptions: { anthropic: { thinking: { type: 'enabled' } } },
      headers: { 'x-trace': 't1' },
      contextWindowSize: 200_000,
      providerMode: 'official' as const,
      stripStrictFromTools: true,
    };
    const mp = {
      modelExists: vi.fn(() => true),
      getModelWithOptions: vi.fn(() => full),
    };

    const models = createBrowserHostModels(
      mp as unknown as ModelProviderService,
    );
    const result = await models.getWithOptions('claude-x', 'trace-1', {
      extra: 'metadata',
    });

    expect(mp.getModelWithOptions).toHaveBeenCalledWith('claude-x', 'trace-1', {
      extra: 'metadata',
    });
    expect(result).toBe(full);
  });

  it('delegates has()', () => {
    const mp = {
      modelExists: vi.fn((id: string) => id === 'known'),
      getModelWithOptions: vi.fn(),
    };
    const models = createBrowserHostModels(
      mp as unknown as ModelProviderService,
    );
    expect(models.has('known')).toBe(true);
    expect(models.has('missing')).toBe(false);
    expect(mp.modelExists).toHaveBeenCalledTimes(2);
  });

  it('re-throws Error instances unchanged', async () => {
    const boom = new Error('upstream');
    const mp = {
      modelExists: vi.fn(),
      getModelWithOptions: vi.fn(() => {
        throw boom;
      }),
    };
    const models = createBrowserHostModels(
      mp as unknown as ModelProviderService,
    );
    await expect(models.get('x', 't')).rejects.toBe(boom);
    await expect(models.getWithOptions('x', 't')).rejects.toBe(boom);
  });

  it('wraps non-Error throws into an Error', async () => {
    const mp = {
      modelExists: vi.fn(),
      getModelWithOptions: vi.fn(() => {
        throw 'string-failure';
      }),
    };
    const models = createBrowserHostModels(
      mp as unknown as ModelProviderService,
    );
    await expect(models.get('x', 't')).rejects.toMatchObject({
      message: 'string-failure',
    });
    await expect(models.getWithOptions('x', 't')).rejects.toMatchObject({
      message: 'string-failure',
    });
  });
});

describe('createBrowserTelemetrySink', () => {
  it('delegates capture to TelemetryService.capture', () => {
    const tel = {
      capture: vi.fn(),
      captureException: vi.fn(),
    };
    const sink = createBrowserTelemetrySink(tel as unknown as TelemetryService);
    sink.capture('evt', { a: 1 });
    expect(tel.capture).toHaveBeenCalledWith('evt' as UIEventName, { a: 1 });
  });

  it('swallows capture errors and logs at debug', () => {
    const logger = makeLogger();
    const tel = {
      capture: vi.fn(() => {
        throw new Error('bad event');
      }),
      captureException: vi.fn(),
    };
    const sink = createBrowserTelemetrySink(
      tel as unknown as TelemetryService,
      { logger },
    );
    expect(() => sink.capture('evt')).not.toThrow();
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(
      (logger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toContain('evt');
  });

  it('delegates captureException', () => {
    const tel = {
      capture: vi.fn(),
      captureException: vi.fn(),
    };
    const sink = createBrowserTelemetrySink(tel as unknown as TelemetryService);
    const err = new Error('boom');
    sink.captureException(err, { ctx: 'x' });
    expect(tel.captureException).toHaveBeenCalledWith(err, { ctx: 'x' });
  });

  it('swallows captureException errors', () => {
    const logger = makeLogger();
    const tel = {
      capture: vi.fn(),
      captureException: vi.fn(() => {
        throw new Error('telemetry down');
      }),
    };
    const sink = createBrowserTelemetrySink(
      tel as unknown as TelemetryService,
      { logger },
    );
    expect(() => sink.captureException(new Error('x'))).not.toThrow();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });
});

describe('createBrowserAgentHost', () => {
  it('wires every slot and passes the logger through identity', () => {
    const logger = makeLogger();
    const mp = {
      modelExists: vi.fn(() => true),
      getModelWithOptions: vi.fn(),
    };
    const tel = {
      capture: vi.fn(),
      captureException: vi.fn(),
    };

    const host = createBrowserAgentHost({
      logger: logger as unknown as BrowserLogger,
      modelProviderService: mp as unknown as ModelProviderService,
      telemetryService: tel as unknown as TelemetryService,
    });

    expect(host.paths).toBeDefined();
    expect(host.models).toBeDefined();
    expect(host.telemetry).toBeDefined();
    expect(host.logger).toBe(logger);

    // Smoke-check path + models slots round-trip through the adapters.
    expect(host.paths.dataDir()).toBe('/tmp/data');
    expect(host.models.has('anything')).toBe(true);
  });

  it('defines a full-surface CHAT profile and a curated WORKSPACE_MD profile', () => {
    const logger = makeLogger();
    const mp = {
      modelExists: vi.fn(() => true),
      getModelWithOptions: vi.fn(),
    };
    const tel = {
      capture: vi.fn(),
      captureException: vi.fn(),
    };

    const host = createBrowserAgentHost({
      logger: logger as unknown as BrowserLogger,
      modelProviderService: mp as unknown as ModelProviderService,
      telemetryService: tel as unknown as TelemetryService,
    });

    const chat = host.getAgentProfile(AgentTypes.CHAT);
    expect(chat).toBeDefined();
    expect(new Set(chat?.envDomainIds)).toEqual(
      new Set([
        BROWSER_DOMAIN_ID,
        SHELLS_DOMAIN_ID,
        SANDBOX_DOMAIN_ID,
        ACTIVE_APP_DOMAIN_ID,
        LOG_INGEST_DOMAIN_ID,
        WORKSPACE_DOMAIN_ID,
        AGENTS_MD_DOMAIN_ID,
        ENABLED_SKILLS_DOMAIN_ID,
        PLANS_DOMAIN_ID,
        FILE_DIFFS_DOMAIN_ID,
      ]),
    );
    expect(chat?.outputProtocols?.map((p) => p.name)).toEqual(['tab', 'shell']);
    expect(chat?.systemPromptFragments?.intro).toBeTypeOf('string');
    expect(chat?.systemPromptFragments?.soul).toBeTypeOf('string');
    expect(chat?.systemPromptFragments?.environmentPreamble).toBeTypeOf(
      'string',
    );

    const workspaceMd = host.getAgentProfile(AgentTypes.WORKSPACE_MD);
    expect(workspaceMd).toBeDefined();
    expect(workspaceMd?.envDomainIds).toEqual([WORKSPACE_DOMAIN_ID]);
    expect(workspaceMd?.outputProtocols).toBeUndefined();
    expect(workspaceMd?.outputAliases).toBeUndefined();
    expect(workspaceMd?.systemPromptFragments).toBeUndefined();
  });

  it('reuses a caller-supplied HostPaths when provided', () => {
    const customPaths = {
      ...createBrowserHostPaths(),
      dataDir: () => '/custom/data',
    };
    const logger = makeLogger();
    const host = createBrowserAgentHost({
      logger: logger as unknown as BrowserLogger,
      modelProviderService: {} as ModelProviderService,
      telemetryService: {} as TelemetryService,
      paths: customPaths,
    });
    expect(host.paths).toBe(customPaths);
    expect(host.paths.dataDir()).toBe('/custom/data');
  });
});
