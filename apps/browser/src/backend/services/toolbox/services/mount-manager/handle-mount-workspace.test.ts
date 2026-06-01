import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockHomeDir = path.join(os.tmpdir(), 'mount-manager-mock-home');

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'home' ? mockHomeDir : path.join(os.tmpdir(), `mock-${name}`),
  },
}));

import { MountManagerService } from '.';
import type { FilePickerService } from '@/services/file-picker';
import type { GitService } from '@/services/git';
import type { KartonService } from '@/services/karton';
import type { Logger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import type { UserExperienceService } from '@/services/experience';
import {
  AgentStore,
  createInitialAgentSystemState,
} from '@stagewise/agent-core';

const services: MountManagerService[] = [];

beforeEach(async () => {
  mockHomeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'mount-manager-mock-home-'),
  );
});

afterEach(async () => {
  await Promise.all(services.splice(0).map((s) => s.teardown()));
  await fs.rm(mockHomeDir, { recursive: true, force: true });
});

function createHarness() {
  const state = {
    toolbox: {
      agent1: {
        workspace: { mounts: [] },
        pendingFileDiffs: [],
        editSummary: [],
        pendingUserQuestion: null,
      },
    },
    agents: { instances: { agent1: { type: 'regular' } } },
    workspaceGitSetup: { runsByPath: {} },
    gitWorktreeRevisions: {} as Record<string, number>,
  };

  const uiKarton = {
    state,
    setState: vi.fn((recipe: (draft: typeof state) => void) => recipe(state)),
    registerServerProcedureHandler: vi.fn(),
    removeServerProcedureHandler: vi.fn(),
  } as unknown as KartonService;

  const gitService = {
    getMountedWorkspaceSummary: vi.fn(async () => null),
  } as unknown as GitService;

  const userExperienceService = {
    getRecentlyOpenedWorkspaces: vi.fn(async () => []),
    saveRecentlyOpenedWorkspace: vi.fn(),
  } as unknown as UserExperienceService;

  const preferencesService = {
    get: vi.fn(() => ({
      agent: { workspaceGitCleanup: { dismissedCandidates: {} } },
    })),
    snoozeWorkspaceGitCleanupCandidates: vi.fn(),
    pruneWorkspaceGitCleanupSnoozes: vi.fn(),
  };

  const debug = vi.fn();
  const logger = {
    debug,
    warn: vi.fn(),
    error: vi.fn(),
    isDebugEnabled: false,
  } as unknown as Logger;

  const agentStore = new AgentStore(createInitialAgentSystemState());

  const service = new MountManagerService(
    logger,
    {} as FilePickerService,
    userExperienceService,
    uiKarton,
    {
      capture: vi.fn(),
      captureException: vi.fn(),
    } as unknown as TelemetryService,
    gitService,
    preferencesService as never,
    agentStore,
  );

  services.push(service);
  return { service, userExperienceService, debug };
}

describe('MountManagerService.handleMountWorkspace existsSync guard', () => {
  it('skips mounting when the target directory does not exist on disk', async () => {
    const { service, userExperienceService, debug } = createHarness();

    // A path under a temp dir we never created — guaranteed to not exist.
    const missingPath = path.join(
      os.tmpdir(),
      `mount-manager-missing-${Date.now()}-${Math.random()}`,
    );

    await service.handleMountWorkspace('agent1', missingPath);

    // saveRecentlyOpenedWorkspace runs only AFTER the existsSync guard,
    // so observing zero calls is the strongest proof that we bailed.
    expect(
      userExperienceService.saveRecentlyOpenedWorkspace,
    ).not.toHaveBeenCalled();
    expect(service.getMountPrefixes('agent1') ?? []).toHaveLength(0);
    expect(
      (debug as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('Skipping mount of missing workspace'),
      ),
    ).toBe(true);
  });

  it('proceeds when the target directory exists', async () => {
    const { service, userExperienceService } = createHarness();
    const realPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mount-real-'));
    try {
      await service.handleMountWorkspace('agent1', realPath);
      expect(
        userExperienceService.saveRecentlyOpenedWorkspace,
      ).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(realPath, { recursive: true, force: true });
    }
  });
});
