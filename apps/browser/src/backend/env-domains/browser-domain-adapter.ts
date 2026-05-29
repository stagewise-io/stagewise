/**
 * `browser` host {@link DomainAdapter}.
 *
 * Owns the open-tabs + browser-session manifest for the host. The
 * full-state render is the `<open-tabs>` block embedded in every
 * system prompt; the delta render reports tab-opened/navigated/
 * closed/console/restart events. The `browserSessionId` bundled
 * alongside the tabs lets the delta path distinguish a browser
 * restart from a same-process state transition.
 */
import type { DomainAdapter } from '@stagewise/agent-core/env';
import {
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from '@stagewise/agent-core/env';
import type {
  BrowserDomainState,
  BrowserSnapshot,
} from '@shared/env-domain-schemas';
import type { KartonService } from '@/services/karton';
import { getBrowserSessionId } from '@/services/window-layout/browser-session';
import BrowserDomainPromptSection from './browser-domain-adapter.prompt.md?raw';

export const BROWSER_DOMAIN_SCHEMA_VERSION = 1;

export interface BrowserDomainAdapterDeps {
  karton: KartonService;
  /** Optional override for testing. Defaults to `getBrowserSessionId()`. */
  getBrowserSessionId?: () => string;
}

function projectBrowserSnapshot(karton: KartonService): BrowserSnapshot {
  const browser = karton.state.browser;
  const tabs = Object.values(browser.tabs)
    .sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      faviconUrl: tab.faviconUrls?.[0],
      consoleErrorCount: tab.consoleErrorCount,
      consoleLogCount: tab.consoleLogCount,
      error: tab.error
        ? {
            code: tab.error.code,
            message: tab.error.message ?? undefined,
          }
        : null,
      lastFocusedAt: tab.lastFocusedAt,
    }));
  return { tabs, activeTabId: browser.activeTabId ?? null };
}

function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Canonical full-state render for the browser domain. Used as the
 * keyframe (`renderState(null, curr)`) and as the body of the
 * `browser-restarted` change entry.
 */
export function renderBrowserTabsXml(browser: BrowserSnapshot): string {
  if (browser.tabs.length === 0) return 'No tabs open.';
  const tabLines = browser.tabs.map((tab) => {
    const attrs: string[] = [
      `id="${tab.id}"`,
      `title="${escAttr(tab.title ?? '')}"`,
      `url="${escAttr(tab.url)}"`,
    ];
    if (tab.consoleErrorCount)
      attrs.push(`consoleErrors="${tab.consoleErrorCount}"`);
    if (tab.consoleLogCount) attrs.push(`consoleLogs="${tab.consoleLogCount}"`);
    if (tab.error)
      attrs.push(
        `error="${tab.error.code}${tab.error.message ? `: ${escAttr(tab.error.message)}` : ''}"`,
      );
    if (tab.lastFocusedAt)
      attrs.push(`lastActiveAt="${formatTimestamp(tab.lastFocusedAt)}"`);
    if (tab.id === browser.activeTabId) attrs.push('active="true"');
    return `  <tab ${attrs.join(' ')} />`;
  });
  return `<open-tabs>\n${tabLines.join('\n')}\n</open-tabs>`;
}

function computeBrowserChanges(
  previous: BrowserDomainState,
  current: BrowserDomainState,
): EnvironmentChangeEntry[] {
  const isRestart = previous.browserSessionId !== current.browserSessionId;
  const prevTabs = new Map(previous.browser.tabs.map((t) => [t.id, t]));
  const currTabs = new Map(current.browser.tabs.map((t) => [t.id, t]));

  const changes: EnvironmentChangeEntry[] = [];
  if (isRestart) changes.push({ type: 'browser-restarted' });

  if (!isRestart) {
    for (const [id] of prevTabs) {
      if (!currTabs.has(id)) {
        changes.push({ type: 'tab-closed', attributes: { tabId: id } });
      }
    }
  }

  for (const [id, curr] of currTabs) {
    if (!prevTabs.has(id)) {
      changes.push({
        type: 'tab-opened',
        attributes: { tabId: id, url: curr.url },
      });
      continue;
    }
    const prev = prevTabs.get(id)!;

    if (prev.url !== curr.url) {
      const attrs: Record<string, string> = { tabId: id, url: curr.url };
      if (prev.title !== curr.title) attrs.title = curr.title ?? '';
      changes.push({ type: 'tab-navigated', attributes: attrs });
    } else if (prev.title !== curr.title) {
      changes.push({
        type: 'tab-navigated',
        attributes: { tabId: id, title: curr.title ?? '' },
      });
    }

    const prevErr = prev.error;
    const currErr = curr.error;
    if (JSON.stringify(prevErr) !== JSON.stringify(currErr)) {
      if (!prevErr && currErr) {
        const attrs: Record<string, string> = {
          tabId: id,
          code: String(currErr.code),
        };
        if (currErr.message) attrs.message = currErr.message;
        changes.push({ type: 'tab-error', attributes: attrs });
      } else if (prevErr && !currErr) {
        changes.push({ type: 'tab-error-cleared', attributes: { tabId: id } });
      } else if (prevErr && currErr) {
        changes.push({
          type: 'tab-error',
          attributes: {
            tabId: id,
            code: String(currErr.code),
            ...(currErr.message ? { message: currErr.message } : {}),
          },
        });
      }
    }

    const prevLogs = prev.consoleLogCount ?? 0;
    const currLogs = curr.consoleLogCount ?? 0;
    const prevErrors = prev.consoleErrorCount ?? 0;
    const currErrors = curr.consoleErrorCount ?? 0;
    if (currLogs > prevLogs || currErrors > prevErrors) {
      const attrs: Record<string, string> = { tabId: id };
      if (currLogs > prevLogs) attrs.newLogs = String(currLogs - prevLogs);
      if (currErrors > prevErrors)
        attrs.newErrors = String(currErrors - prevErrors);
      changes.push({ type: 'tab-console', attributes: attrs });
    }
  }

  if (
    previous.browser.activeTabId !== current.browser.activeTabId &&
    current.browser.activeTabId !== null
  ) {
    const attrs: Record<string, string> = { to: current.browser.activeTabId };
    if (previous.browser.activeTabId !== null)
      attrs.from = previous.browser.activeTabId;
    changes.push({ type: 'active-tab-changed', attributes: attrs });
  }

  return changes;
}

export function createBrowserDomainAdapter(
  deps: BrowserDomainAdapterDeps,
): DomainAdapter<BrowserDomainState> {
  const resolveSessionId = deps.getBrowserSessionId ?? getBrowserSessionId;
  return {
    domainId: 'browser',
    renderOrder: 0,
    schemaVersion: BROWSER_DOMAIN_SCHEMA_VERSION,
    promptSection: BrowserDomainPromptSection,
    getState() {
      return {
        browser: projectBrowserSnapshot(deps.karton),
        browserSessionId: resolveSessionId(),
      };
    },
    renderState(prev, curr) {
      if (prev === null) return renderBrowserTabsXml(curr.browser);
      return renderChangesXml(computeBrowserChanges(prev, curr));
    },
  };
}
