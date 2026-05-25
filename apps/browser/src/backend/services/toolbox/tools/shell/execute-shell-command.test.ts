import { describe, expect, it, vi } from 'vitest';
import {
  executeShellCommand,
  type SmartApprovalDeps,
} from './execute-shell-command';
import type { ShellService } from '@/services/toolbox/services/shell';
import type { TelemetryService } from '@/services/telemetry';
import type { ModelProviderService } from '@/agents/model-provider';

const createSmartApprovalDeps = (): SmartApprovalDeps => ({
  modelProviderService: {
    getModelWithOptions: vi.fn(),
  } as unknown as Pick<ModelProviderService, 'getModelWithOptions'>,
  telemetryService: {} as TelemetryService,
  recordPendingApproval: vi.fn(),
});

const createShellService = (): ShellService =>
  ({
    getRecentOutputForClassifier: vi.fn(() => ''),
    getSessionCurrentCwd: vi.fn(() => '/tmp'),
  }) as unknown as ShellService;

describe('executeShellCommand approval', () => {
  it('always allows kill calls even when approval mode is alwaysAsk', async () => {
    const shellService = createShellService();
    const smartApproval = createSmartApprovalDeps();
    const tool = executeShellCommand(
      shellService,
      'agent-1',
      () => 'alwaysAsk',
      () => new Map([['wtest', '/tmp']]),
      smartApproval,
    );

    expect(typeof tool.needsApproval).toBe('function');
    if (typeof tool.needsApproval !== 'function') {
      throw new Error('Expected executeShellCommand to define needsApproval');
    }

    const needsApproval = await tool.needsApproval(
      {
        explanation: 'Close terminal',
        session_id: 'session-1',
        kill: true,
      },
      { toolCallId: 'tool-1', messages: [] },
    );

    expect(needsApproval).toBe(false);
    expect(smartApproval.recordPendingApproval).not.toHaveBeenCalled();
  });
});
