import { describe, expect, it } from 'vitest';
import {
  BROWSER_DOMAIN_SCHEMA_VERSION,
  createBrowserDomainAdapter,
} from './browser-domain-adapter';
import type { KartonService } from '../services/karton';

function makeKarton(state: {
  tabs: Record<
    string,
    {
      id: string;
      url: string;
      title: string;
      lastFocusedAt: number;
      consoleErrorCount?: number;
      consoleLogCount?: number;
      faviconUrls?: string[];
      error?: { code: number; message?: string | null } | null;
    }
  >;
  activeTabId: string | null;
}): KartonService {
  return {
    state: {
      browser: state,
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
});
