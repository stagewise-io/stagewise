import type { BrowserSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { renderBrowserTabsXml } from '../../system/browser-tabs-renderer';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two browser snapshots and produces compact, grouped
 * change descriptions. Returns an empty array when there is no
 * previous snapshot (first message) or when nothing changed.
 *
 * When `browserSessionId` changes between snapshots, a single
 * `browser-restarted` event is emitted and all individual tab-level
 * events are suppressed — the agent should treat all old tab IDs as
 * invalid and use the new session's tab list instead.
 */
export function computeBrowserChanges(
  previous: BrowserSnapshot | null,
  current: BrowserSnapshot,
  previousSessionId?: string,
  currentSessionId?: string,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  // Browser restart detected — session ID changed between messages.
  // Suppress all individual tab events; emit a single restart notice instead.
  if (
    previousSessionId &&
    currentSessionId &&
    previousSessionId !== currentSessionId
  ) {
    const tabDetail = renderBrowserTabsXml(current);
    return [
      {
        type: 'browser-restarted',
        summary:
          'all old tabs were closed and the user is in a new session. Tab IDs have been reset.',
        detail: tabDetail,
      },
    ];
  }

  const prevTabs = new Map(previous.tabs.map((t) => [t.id, t]));
  const currTabs = new Map(current.tabs.map((t) => [t.id, t]));

  const closed: string[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const titleChanged: string[] = [];
  const errorChanges: string[] = [];
  const consoleChanges: string[] = [];

  for (const [id] of prevTabs) if (!currTabs.has(id)) closed.push(id);

  for (const [id, curr] of currTabs) {
    if (!prevTabs.has(id)) {
      opened.push(`${id} (${curr.url})`);
      continue;
    }
    const prev = prevTabs.get(id)!;
    if (prev.url !== curr.url)
      navigated.push(`${id} (${prev.url} -> ${curr.url})`);
    if (prev.title !== curr.title)
      titleChanged.push(`${id} ("${prev.title}" -> "${curr.title}")`);

    const prevErr = prev.error;
    const currErr = curr.error;
    if (JSON.stringify(prevErr) !== JSON.stringify(currErr)) {
      if (!prevErr && currErr)
        errorChanges.push(
          `${id}: error ${currErr.code}${currErr.message ? ` - ${currErr.message}` : ''}`,
        );
      else if (prevErr && !currErr) errorChanges.push(`${id}: error cleared`);
      else if (prevErr && currErr)
        errorChanges.push(
          `${id}: error changed ${prevErr.code} -> ${currErr.code}`,
        );
    }

    const prevLogs = prev.consoleLogCount ?? 0;
    const currLogs = curr.consoleLogCount ?? 0;
    const prevErrors = prev.consoleErrorCount ?? 0;
    const currErrors = curr.consoleErrorCount ?? 0;
    if (currLogs > prevLogs || currErrors > prevErrors) {
      const parts: string[] = [];
      if (currLogs > prevLogs) parts.push(`+${currLogs - prevLogs} log(s)`);
      if (currErrors > prevErrors)
        parts.push(`+${currErrors - prevErrors} error(s)`);
      consoleChanges.push(`${id}: ${parts.join(', ')}`);
    }
  }

  const changes: EnvironmentChangeEntry[] = [];

  if (closed.length > 0) {
    const label = closed.length === 1 ? 'tab closed' : 'tabs closed';
    changes.push({
      type: 'tab-closed',
      summary: `${label}: [${closed.join(', ')}]`,
    });
  }
  if (opened.length > 0) {
    const label = opened.length === 1 ? 'new tab opened' : 'new tabs opened';
    changes.push({
      type: 'tab-opened',
      summary: `${label}: [${opened.join(', ')}]`,
    });
  }
  if (navigated.length > 0) {
    const label = navigated.length === 1 ? 'tab navigated' : 'tabs navigated';
    changes.push({
      type: 'tab-navigated',
      summary: `${label}: [${navigated.join(', ')}]`,
    });
  }
  if (titleChanged.length > 0) {
    changes.push({
      type: 'tab-title-changed',
      summary: `tab title changed: [${titleChanged.join(', ')}]`,
    });
  }
  if (errorChanges.length > 0) {
    changes.push({
      type: 'tab-error',
      summary: `tab errors: [${errorChanges.join(', ')}]`,
    });
  }
  if (consoleChanges.length > 0) {
    changes.push({
      type: 'tab-console',
      summary: `console output: [${consoleChanges.join(', ')}]`,
    });
  }

  if (
    previous.activeTabId !== current.activeTabId &&
    current.activeTabId !== null
  ) {
    const summary =
      previous.activeTabId === null
        ? `active tab: ${current.activeTabId}`
        : `active tab: ${previous.activeTabId} -> ${current.activeTabId}`;
    changes.push({ type: 'active-tab-changed', summary });
  }

  return changes;
}
