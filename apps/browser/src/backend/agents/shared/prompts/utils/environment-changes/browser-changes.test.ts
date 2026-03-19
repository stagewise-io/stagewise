import { describe, it, expect } from 'vitest';
import type { BrowserSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeBrowserChanges } from './browser-changes';

function makeBrowser(
  tabs: { id: string; url: string; title: string }[],
  activeTabId: string | null = null,
): BrowserSnapshot {
  return { tabs, activeTabId };
}

function types(entries: ReturnType<typeof computeBrowserChanges>): string[] {
  return entries.map((e) => e.type);
}

function attrs(
  entries: ReturnType<typeof computeBrowserChanges>,
  type: string,
) {
  return entries.find((e) => e.type === type)?.attributes;
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

  // ── tab-closed ────────────────────────────────────────────────────────────

  it('detects a closed tab via tabId attribute', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
      { id: 't_2', url: 'https://b.com', title: 'B' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const result = computeBrowserChanges(previous, current);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tab-closed');
    expect(result[0].attributes?.tabId).toBe('t_2');
  });

  it('emits one tab-closed entry per closed tab', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
      { id: 't_2', url: 'https://b.com', title: 'B' },
      { id: 't_3', url: 'https://c.com', title: 'C' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const result = computeBrowserChanges(previous, current);
    const closed = result.filter((e) => e.type === 'tab-closed');
    expect(closed).toHaveLength(2);
    expect(closed.map((e) => e.attributes?.tabId).sort()).toEqual([
      't_2',
      't_3',
    ]);
  });

  // ── tab-opened ────────────────────────────────────────────────────────────

  it('detects a new tab with tabId and url attributes', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
      { id: 't_2', url: 'https://b.com', title: 'B' },
    ]);
    const result = computeBrowserChanges(previous, current);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tab-opened');
    expect(result[0].attributes).toEqual({
      tabId: 't_2',
      url: 'https://b.com',
    });
  });

  // ── tab-navigated ─────────────────────────────────────────────────────────

  it('merges url navigation and title change into one tab-navigated entry', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://b.com', title: 'B' },
    ]);
    const result = computeBrowserChanges(previous, current);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tab-navigated');
    expect(result[0].attributes).toEqual({
      tabId: 't_1',
      url: 'https://b.com',
      title: 'B',
    });
  });

  it('navigation without title change omits title attribute', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'Same' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://b.com', title: 'Same' },
    ]);
    const result = computeBrowserChanges(previous, current);
    expect(result[0].attributes).toEqual({
      tabId: 't_1',
      url: 'https://b.com',
    });
    expect(result[0].attributes?.title).toBeUndefined();
  });

  it('title-only change (SPA) is reported as tab-navigated with title attribute', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'Old Title' },
    ]);
    const current = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'New Title' },
    ]);
    const result = computeBrowserChanges(previous, current);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tab-navigated');
    expect(result[0].attributes).toEqual({ tabId: 't_1', title: 'New Title' });
    expect(result[0].attributes?.url).toBeUndefined();
  });

  // ── active-tab-changed ────────────────────────────────────────────────────

  it('detects active tab change with from/to attributes', () => {
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
    const result = computeBrowserChanges(previous, current);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('active-tab-changed');
    expect(result[0].attributes).toEqual({ from: 't_1', to: 't_2' });
  });

  it('active tab set from null omits from attribute', () => {
    const previous = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      null,
    );
    const current = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      't_1',
    );
    const result = computeBrowserChanges(previous, current);
    expect(result[0].type).toBe('active-tab-changed');
    expect(result[0].attributes?.to).toBe('t_1');
    expect(result[0].attributes?.from).toBeUndefined();
  });

  it('does not report active tab change when it becomes null', () => {
    const previous = makeBrowser(
      [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      't_1',
    );
    const current = makeBrowser([], null);
    const result = computeBrowserChanges(previous, current);
    expect(result.some((e) => e.type === 'active-tab-changed')).toBe(false);
  });

  // ── browser-restarted ─────────────────────────────────────────────────────

  it('emits browser-restarted then tab-opened (no tab-closed) on session ID change', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([
      { id: 't_2', url: 'https://b.com', title: 'B' },
    ]);
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    expect(result[0].type).toBe('browser-restarted');
    expect(types(result)).toContain('tab-opened');
    expect(types(result)).not.toContain('tab-closed');
  });

  it('browser restart shows new tabs as opened', () => {
    const previous = makeBrowser([
      { id: 't_old', url: 'https://old.com', title: 'Old' },
    ]);
    const current = makeBrowser(
      [{ id: 't_new', url: 'https://new.com', title: 'New' }],
      't_new',
    );
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    expect(attrs(result, 'tab-opened')).toEqual({
      tabId: 't_new',
      url: 'https://new.com',
    });
  });

  it('browser restart with no new tabs only emits browser-restarted', () => {
    const previous = makeBrowser([
      { id: 't_1', url: 'https://a.com', title: 'A' },
    ]);
    const current = makeBrowser([]);
    const result = computeBrowserChanges(previous, current, 'sess-1', 'sess-2');
    expect(types(result)).toEqual(['browser-restarted']);
  });

  // ── combined ──────────────────────────────────────────────────────────────

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
        { id: 't_2', url: 'https://b2.com', title: 'B2' },
        { id: 't_3', url: 'https://c.com', title: 'C' },
      ],
      't_3',
    );
    const result = computeBrowserChanges(previous, current);
    expect(types(result)).toContain('tab-closed');
    expect(attrs(result, 'tab-closed')?.tabId).toBe('t_1');
    expect(types(result)).toContain('tab-opened');
    expect(attrs(result, 'tab-opened')).toEqual({
      tabId: 't_3',
      url: 'https://c.com',
    });
    expect(types(result)).toContain('tab-navigated');
    expect(attrs(result, 'tab-navigated')).toEqual({
      tabId: 't_2',
      url: 'https://b2.com',
      title: 'B2',
    });
    expect(types(result)).toContain('active-tab-changed');
    expect(attrs(result, 'active-tab-changed')).toEqual({
      from: 't_1',
      to: 't_3',
    });
  });
});
