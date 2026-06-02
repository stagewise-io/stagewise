import { describe, expect, it } from 'vitest';
import type { AgentStore } from '@stagewise/agent-core';
import {
  ACTIVE_APP_DOMAIN_SCHEMA_VERSION,
  createActiveAppDomainAdapter,
} from './active-app-domain-adapter';

function makeStore(
  byAgent: Record<string, { appId: string; pluginId?: string } | undefined>,
): AgentStore {
  return {
    get: () => ({
      toolbox: Object.fromEntries(
        Object.entries(byAgent).map(([id, app]) => [
          id,
          { activeApp: app ?? null },
        ]),
      ),
    }),
  } as unknown as AgentStore;
}

describe('createActiveAppDomainAdapter', () => {
  it('reports the expected contract metadata', () => {
    const adapter = createActiveAppDomainAdapter({ store: makeStore({}) });
    expect(adapter.domainId).toBe('activeApp');
    expect(adapter.renderOrder).toBe(9);
    expect(adapter.schemaVersion).toBe(ACTIVE_APP_DOMAIN_SCHEMA_VERSION);
  });

  it('renders the active app id as the keyframe', () => {
    const adapter = createActiveAppDomainAdapter({
      store: makeStore({ a1: { appId: 'editor' } }),
    });
    const curr = adapter.getState('a1') as never;
    expect(adapter.renderState(null, curr)).toBe('<active_app id="editor" />');
  });

  it('includes the pluginId attribute when present', () => {
    const adapter = createActiveAppDomainAdapter({
      store: makeStore({ a1: { appId: 'editor', pluginId: 'p' } }),
    });
    const curr = adapter.getState('a1') as never;
    expect(adapter.renderState(null, curr)).toBe(
      '<active_app id="editor" plugin="p" />',
    );
  });

  it('emits app-changed when switching apps', () => {
    const adapter = createActiveAppDomainAdapter({
      store: makeStore({ a1: { appId: 'b' } }),
    });
    const curr = adapter.getState('a1') as never;
    const prev = { appId: 'a' } as never;
    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('app-changed');
    expect(diff).toContain('from="a"');
    expect(diff).toContain('to="b"');
  });

  it('emits app-opened / app-closed at boundary transitions', () => {
    const adapter = createActiveAppDomainAdapter({
      store: makeStore({ a1: { appId: 'b' } }),
    });
    const curr = adapter.getState('a1') as never;
    expect(adapter.renderState(null as never, curr)).toBe(
      '<active_app id="b" />',
    );
    expect(adapter.renderState(curr, null)).toContain('app-closed');
  });

  it('exposes a non-empty promptSection covering Mini-Apps keywords', () => {
    const adapter = createActiveAppDomainAdapter({ store: makeStore({}) });
    expect(adapter.promptSection).toBeTruthy();
    const section = adapter.promptSection ?? '';
    expect(section).toContain('Mini-App');
    expect(section).toContain('API.openApp');
  });
});
