import type { BrowserSnapshot } from '@shared/karton-contracts/ui/agent/metadata';

/**
 * Renders a BrowserSnapshot's tab list as the canonical `<open-tabs>` XML
 * block. Used by both the system-prompt environment renderer (initial context)
 * and the browser-restart env-change entry (mid-conversation), so both the
 * model's initial state and restart notifications are always consistent.
 *
 * Returns `"No tabs open."` when the snapshot has no tabs.
 */
export function renderBrowserTabsXml(browser: BrowserSnapshot): string {
  if (browser.tabs.length === 0) {
    return 'No tabs open.';
  }
  const tabLines = browser.tabs.map((tab) => {
    const attrs: string[] = [
      `id="${tab.id}"`,
      `title="${esc(tab.title ?? '')}"`,
      `url="${esc(tab.url)}"`,
    ];
    if (tab.consoleErrorCount)
      attrs.push(`consoleErrors="${tab.consoleErrorCount}"`);
    if (tab.consoleLogCount) attrs.push(`consoleLogs="${tab.consoleLogCount}"`);
    if (tab.error)
      attrs.push(
        `error="${tab.error.code}${tab.error.message ? `: ${esc(tab.error.message)}` : ''}"`,
      );
    if (tab.lastFocusedAt)
      attrs.push(`lastActiveAt="${formatTimestamp(tab.lastFocusedAt)}"`);
    if (tab.id === browser.activeTabId) attrs.push('active="true"');
    return `  <tab ${attrs.join(' ')} />`;
  });
  return `<open-tabs>\n${tabLines.join('\n')}\n</open-tabs>`;
}

export function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${String(d.getFullYear()).slice(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
