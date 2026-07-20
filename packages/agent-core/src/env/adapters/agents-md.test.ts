import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createTestAgentHost } from '../../host/test-utils';
import type { MountManager } from '../../services/mount-manager/mount-registry';
import { createAgentsMdDomainAdapter } from './agents-md';

describe('createAgentsMdDomainAdapter', () => {
  it('respects AGENTS.md by default when the host provides no settings', async () => {
    const mountManager = {
      getMountPrefixes: () => ['w1'],
      getWorkspacePathForPrefix: () => tmpdir(),
    } as unknown as MountManager;
    const adapter = createAgentsMdDomainAdapter({
      host: createTestAgentHost(),
      mountManager,
    });

    const state = await adapter.getState('agent-1');
    expect(state.respectedMounts).toEqual(['w1']);
  });
});
