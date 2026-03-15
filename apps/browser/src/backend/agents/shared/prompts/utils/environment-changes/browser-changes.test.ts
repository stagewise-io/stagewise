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
