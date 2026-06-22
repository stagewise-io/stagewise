import { describe, expect, it } from 'vitest';
import {
  BROWSER_DOMAIN_SCHEMA_VERSION,
  createBrowserDomainAdapter,
} from './browser-domain-adapter';
import type { KartonService } from '../services/karton';
import type { TabState } from '@shared/karton-contracts/ui';

function makeKarton(state: {
  tabs: Record<
    string,
    Partial<TabState> & {
      id: string;
      url: string;
      title: string;
      lastFocusedAt: number;
    }
  >;
  activeTabId: string | null;
}): KartonService {
  return {
    state: {
      contentTabs: {
        tabs: state.tabs,
        globalOrder: [],
        agentOrders: {},
        activeTabId: state.activeTabId,
      },
    },
  } as unknown as KartonService;
}

describe('createBrowserDomainAdapter', () => {
  it('emits the full-state keyframe via renderState(null, curr)', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {
          a: {
            id: 'a',
            url: 'https://example.com',
            title: 'Example',
            lastFocusedAt: 1,
            agentInstanceId: null,
          },
        },
        activeTabId: 'a',
      }),
      getBrowserSessionId: () => 'session-1',
    });

    expect(adapter.domainId).toBe('browser');
    expect(adapter.renderOrder).toBe(0);
    expect(adapter.schemaVersion).toBe(BROWSER_DOMAIN_SCHEMA_VERSION);

    const state = adapter.getState('agent-1') as Promise<unknown> | unknown;
    const curr = state as {
      browser: { tabs: { id: string }[]; activeTabId: string | null };
      browserSessionId: string;
    };

    const full = adapter.renderState(null, curr as never);
    expect(full).toContain('<open-tabs>');
    expect(full).toContain('id="a"');
    expect(full).toContain('active="true"');
  });

  it('renders a tab-opened diff against a prior state', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {
          a: { id: 'a', url: 'https://a', title: 'A', lastFocusedAt: 1 },
          b: { id: 'b', url: 'https://b', title: 'B', lastFocusedAt: 2 },
        },
        activeTabId: 'b',
      }),
      getBrowserSessionId: () => 'session-1',
    });

    const curr = adapter.getState('agent-1') as never;
    const prev = {
      browserSessionId: 'session-1',
      browser: {
        tabs: [{ id: 'a', url: 'https://a', title: 'A', lastFocusedAt: 1 }],
        activeTabId: 'a',
      },
    } as never;

    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('tab-opened');
    expect(diff).toContain('tabId="b"');
    expect(diff).toContain('active-tab-changed');
  });

  it('emits browser-restarted when the session id flips', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {},
        activeTabId: null,
      }),
      getBrowserSessionId: () => 'session-2',
    });
    const curr = adapter.getState('agent-1') as never;
    const prev = {
      browserSessionId: 'session-1',
      browser: { tabs: [], activeTabId: null },
    } as never;

    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('browser-restarted');
  });

  it('emits active-tab-changed with from-only when active tab becomes hidden', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {
          mine: {
            id: 'mine',
            url: 'https://mine.com',
            title: 'Mine',
            lastFocusedAt: 1,
            agentInstanceId: 'agent-1',
          },
          other: {
            id: 'other',
            url: 'https://other.com',
            title: 'Other',
            lastFocusedAt: 2,
            agentInstanceId: 'agent-2',
          },
        },
        // Focus moved to another agent's tab — invisible to agent-1
        activeTabId: 'other',
      }),
      getBrowserSessionId: () => 'session-1',
    });

    const curr = adapter.getState('agent-1') as never;
    const prev = {
      browserSessionId: 'session-1',
      browser: {
        tabs: [
          {
            id: 'mine',
            url: 'https://mine.com',
            title: 'Mine',
            lastFocusedAt: 1,
          },
        ],
        activeTabId: 'mine',
      },
    } as never;

    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('active-tab-changed');
    expect(diff).toContain('from="mine"');
    expect(diff).not.toContain('to=');
  });

  it('exposes a non-empty promptSection covering CDP/browser keywords', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({ tabs: {}, activeTabId: null }),
      getBrowserSessionId: () => 'session-1',
    });
    expect(adapter.promptSection).toBeTruthy();
    const section = adapter.promptSection ?? '';
    expect(section).toContain('CDP');
    expect(section).toContain('Browser Access');
  });

  it('filters tabs by agentInstanceId — only global + same-agent tabs', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {
          global: {
            id: 'global',
            url: 'https://global.com',
            title: 'Global',
            lastFocusedAt: 1,
            agentInstanceId: null,
          },
          mine: {
            id: 'mine',
            url: 'https://mine.com',
            title: 'Mine',
            lastFocusedAt: 2,
            agentInstanceId: 'agent-1',
          },
          other: {
            id: 'other',
            url: 'https://other.com',
            title: 'Other',
            lastFocusedAt: 3,
            agentInstanceId: 'agent-2',
          },
        },
        activeTabId: 'mine',
      }),
      getBrowserSessionId: () => 'session-1',
    });

    const state = adapter.getState('agent-1') as {
      browser: { tabs: { id: string }[]; activeTabId: string | null };
    };
    const tabIds = state.browser.tabs.map((t) => t.id);
    expect(tabIds).toContain('global');
    expect(tabIds).toContain('mine');
    expect(tabIds).not.toContain('other');
    expect(state.browser.activeTabId).toBe('mine');
  });

  it('hides activeTabId when the active tab belongs to another agent', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {
          mine: {
            id: 'mine',
            url: 'https://mine.com',
            title: 'Mine',
            lastFocusedAt: 1,
            agentInstanceId: 'agent-1',
          },
          other: {
            id: 'other',
            url: 'https://other.com',
            title: 'Other',
            lastFocusedAt: 2,
            agentInstanceId: 'agent-2',
          },
        },
        activeTabId: 'other',
      }),
      getBrowserSessionId: () => 'session-1',
    });

    const state = adapter.getState('agent-1') as {
      browser: { tabs: { id: string }[]; activeTabId: string | null };
    };
    expect(state.browser.activeTabId).toBeNull();
    const tabIds = state.browser.tabs.map((t) => t.id);
    expect(tabIds).toContain('mine');
    expect(tabIds).not.toContain('other');
  });

  it('excludes terminal and file tabs from the snapshot', () => {
    const adapter = createBrowserDomainAdapter({
      karton: makeKarton({
        tabs: {
          browser: {
            id: 'browser',
            url: 'https://browser.com',
            title: 'Browser',
            lastFocusedAt: 1,
            agentInstanceId: null,
            type: 'browser',
          },
          terminal: {
            id: 'terminal',
            url: '',
            title: 'Terminal',
            lastFocusedAt: 2,
            agentInstanceId: null,
            type: 'terminal',
          },
          file: {
            id: 'file',
            url: '',
            title: 'file.ts',
            lastFocusedAt: 3,
            agentInstanceId: null,
            type: 'file',
          },
        },
        activeTabId: 'browser',
      }),
      getBrowserSessionId: () => 'session-1',
    });

    const state = adapter.getState('agent-1') as {
      browser: { tabs: { id: string }[]; activeTabId: string | null };
    };
    const tabIds = state.browser.tabs.map((t) => t.id);
    expect(tabIds).toEqual(['browser']);
  });
});
