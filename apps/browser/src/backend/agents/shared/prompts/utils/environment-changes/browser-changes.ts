import type { BrowserSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two browser snapshots and produces compact, grouped
 * change descriptions. Returns an empty array when there is no
 * previous snapshot (first message) or when nothing changed.
 *
 * When `browserSessionId` changes between snapshots, a `browser-restarted`
 * entry is prepended, `tab-closed` entries are suppressed (the restart notice
 * already implies all old tabs are gone), and new tabs appear as regular
 * `tab-opened` entries.
 */
export function computeBrowserChanges(
  previous: BrowserSnapshot | null,
  current: BrowserSnapshot,
  previousSessionId?: string,
  currentSessionId?: string,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  const isRestart =
    !!previousSessionId &&
    !!currentSessionId &&
    previousSessionId !== currentSessionId;

  const prevTabs = new Map(previous.tabs.map((t) => [t.id, t]));
  const currTabs = new Map(current.tabs.map((t) => [t.id, t]));

  const changes: EnvironmentChangeEntry[] = [];

  if (isRestart) {
    changes.push({ type: 'browser-restarted' });
  }

  // Closed tabs — suppressed on restart (implied by browser-restarted)
  if (!isRestart) {
    for (const [id] of prevTabs) {
      if (!currTabs.has(id)) {
        changes.push({ type: 'tab-closed', attributes: { tabId: id } });
      }
    }
  }

  for (const [id, curr] of currTabs) {
    if (!prevTabs.has(id)) {
      // Newly opened tab
      changes.push({
        type: 'tab-opened',
        attributes: { tabId: id, url: curr.url },
      });
      continue;
    }

    const prev = prevTabs.get(id)!;

    // Navigation: url changed → show new url (+ new title if it also changed).
    // Title-only change (SPA): show new title.
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

    // Page error state
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
        changes.push({
          type: 'tab-error-cleared',
          attributes: { tabId: id },
        });
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

    // Console activity
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

  // Active tab change
  if (
    previous.activeTabId !== current.activeTabId &&
    current.activeTabId !== null
  ) {
    const attrs: Record<string, string> = { to: current.activeTabId };
    if (previous.activeTabId !== null) attrs.from = previous.activeTabId;
    changes.push({ type: 'active-tab-changed', attributes: attrs });
  }

  return changes;
}
