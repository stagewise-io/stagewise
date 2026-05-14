import { describe, expect, it } from 'vitest';
import { userPreferencesSchema } from './shared-types';

describe('userPreferencesSchema sidebar defaults', () => {
  it('defaults sidebar preferences when sidebar is missing', () => {
    const parsed = userPreferencesSchema.parse({});

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: [],
    });
  });

  it('defaults pinned agent ids for legacy sidebar preferences', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { showActiveAgents: false },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: false,
      pinnedAgentIds: [],
    });
  });

  it('defaults active agents visibility when only pinned ids exist', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { pinnedAgentIds: ['agent-b', 'agent-a'] },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: ['agent-b', 'agent-a'],
    });
  });

  it('preserves complete sidebar preferences', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { showActiveAgents: false, pinnedAgentIds: ['agent-a'] },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: false,
      pinnedAgentIds: ['agent-a'],
    });
  });
});
