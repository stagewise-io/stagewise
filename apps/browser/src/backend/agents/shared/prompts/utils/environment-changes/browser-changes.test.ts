import { describe, it, expect } from 'vitest';
import type { BrowserSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeBrowserChanges } from './browser-changes';

function makeBrowser(
  tabs: { id: string; url: string; title: string }[],
  activeTabId: string | null = null,
): BrowserSnapshot {
  return { tabs, activeTabId };
}

function summaries(
  entries: ReturnType<typeof computeBrowserChanges>,
): string[] {
  return entries.map((e) => e.summary);
}

describe('computeBrowserChanges', () => {
  it('returns empty array when previous is null', () => {
    const current = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      't_1',
    );
    expect(computeBrowserChanges(null, current)).toEqual([]);
  });

  it('returns empty array when nothing changed', () => {
    const snap = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      't_1',
    );
    expect(computeBrowserChanges(snap, snap)).toEqual([]);
  });

  it('detects a closed tab (singular)', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'Tab A' },
      { id: 't_2', url: 'https://b.com', title: 'Tab B' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'Tab A' },
    ]);
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('tab closed: [t_2]');
  });

  it('detects multiple closed tabs (plural)', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
      { id: 't_2', url: 'https://b.com', title: 'B' },
      { id: 't_3', url: 'https://c.com', title: 'C' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('tabs closed: [t_2, t_3]');
  });

  it('detects a new tab (singular)', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
      { id: 't_2', url: 'https://b.com', title: 'B' },
    ]);
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('new tab opened: [t_2 (https://b.com)]');
  });

  it('detects tab navigation', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://b.com', title: 'B' },
    ]);
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain(
      'tab navigated: [t_1 (https://a.com -> https://b.com)]',
    );
  });

  it('detects active tab change', () => {
    const previous = makeBrowser(
      [
        { id: 't_1', url: 'https://a.com', title: 'A' },
        { id: 't_2', url: 'https://b.com', title: 'B' },
      ],
      't_1',
    );
    const current = makeBrowser(
      [
        { id: 't_1', url: 'https://a.com', title: 'A' },
        { id: 't_2', url: 'https://b.com', title: 'B' },
      ],
      't_2',
    );
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('active tab: t_1 -> t_2');
  });

  it('detects active tab set from null', () => {
    const previous = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      null,
    );
    const current = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      't_1',
    );
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('active tab: t_1');
  });

  it('does not report active tab change when it becomes null', () => {
    const previous = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      't_1',
    );
    const current = makeBrowser([], null);
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('tab closed: [t_1]');
    expect(result.some((c) => c.startsWith('active tab'))).toBe(false);
  });

  it('emits browser-restarted when session ID changes', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_2', url: 'https://b.com', title: 'B' },
      { id: 't_3', url: 'https://c.com', title: 'C' },
    ]);
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('browser-restarted');
    expect(result[0].summary).toContain('new session');
  });

  it('browser-restarted detail includes new tab list', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://old.com', title: 'Old' },
    ]);
    const current = makeBrowser(
      [
        { id: 't_new1', url: 'https://example.com', title: 'Example' },
        { id: 't_new2', url: 'https://other.com', title: 'Other' },
      ],
      't_new1',
    );
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    expect(result).toHaveLength(1);
    const detail = result[0].detail ?? '';
    expect(detail).toContain('<open-tabs>');
    expect(detail).toContain('id="t_new1"');
    expect(detail).toContain('url="https://example.com"');
    expect(detail).toContain('active="true"');
    expect(detail).toContain('id="t_new2"');
    expect(detail).not.toContain('t_1');
    expect(detail).not.toContain('old.com');
  });

  it('browser-restarted detail says no tabs when new session is empty', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([]);
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    expect(result).toHaveLength(1);
    expect(result[0].detail).toBe('No tabs open.');
  });

  it('suppresses individual tab events on browser restart', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_2', url: 'https://b.com', title: 'B' },
    ]);
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    // Only the restart entry — no tab-closed / tab-opened / etc.
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('browser-restarted');
  });

  it('handles multiple simultaneous changes', () => {
    const previous = makeBrowser(
      [
        { id: 't_1', url: 'https://a.com', title: 'A' },
        { id: 't_2', url: 'https://b.com', title: 'B' },
      ],
      't_1',
    );
    const current = makeBrowser(
      [
        {
          id: 't_2',
          url: 'https://b2.com',
          title: 'B2',
        },
        { id: 't_3', url: 'https://c.com', title: 'C' },
      ],
      't_3',
    );
    const result = summaries(computeBrowserChanges(previous, current));
    expect(result).toContain('tab closed: [t_1]');
    expect(result).toContain('new tab opened: [t_3 (https://c.com)]');
    expect(result).toContain(
      'tab navigated: [t_2 (https://b.com -> https://b2.com)]',
    );
    expect(result).toContain('active tab: t_1 -> t_3');
  });
});
