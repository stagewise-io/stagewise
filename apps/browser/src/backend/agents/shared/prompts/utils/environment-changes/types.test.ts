import { describe, it, expect } from 'vitest';
import {
  renderEnvironmentChangesXml,
  type EnvironmentChangeEntry,
} from './types';

describe('renderEnvironmentChangesXml', () => {
  it('returns empty string for empty array', () => {
    expect(renderEnvironmentChangesXml([])).toBe('');
  });

  it('renders simple entry with type as tag name and summary as body', () => {
    const entries: EnvironmentChangeEntry[] = [
      { type: 'tab-closed', summary: 'tab closed' },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain('<env-changes>');
    expect(xml).toContain('</env-changes>');
    expect(xml).toContain('<tab-closed>tab closed</tab-closed>');
  });

  it('renders self-closing tag when no summary or detail', () => {
    const entries: EnvironmentChangeEntry[] = [{ type: 'browser-restarted' }];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain('<browser-restarted />');
    expect(xml).not.toContain('</browser-restarted>');
  });

  it('renders self-closing tag with attributes when no body', () => {
    const entries: EnvironmentChangeEntry[] = [
      {
        type: 'tab-opened',
        attributes: { tabId: 't_1', url: 'https://a.com' },
      },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain('<tab-opened tabId="t_1" url="https://a.com" />');
  });

  it('renders entry with attributes and escapes special chars', () => {
    const entries: EnvironmentChangeEntry[] = [
      {
        type: 'agents-md-created',
        summary: 'AGENTS.md created in w1',
        attributes: { path: 'w1', label: 'a&b "c"' },
      },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain(' path="w1"');
    expect(xml).toContain(' label="a&amp;b &quot;c&quot;"');
  });

  it('renders entry with detail appended after summary', () => {
    const entries: EnvironmentChangeEntry[] = [
      {
        type: 'agents-md-updated',
        detail: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new',
        attributes: { path: 'w1' },
      },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain('--- a');
    expect(xml).toContain('+new</agents-md-updated>');
  });

  it('renders multiple self-closing entries', () => {
    const entries: EnvironmentChangeEntry[] = [
      { type: 'sandbox-restarted' },
      {
        type: 'tab-opened',
        attributes: { tabId: 't_2', url: 'https://b.com' },
      },
      { type: 'skill-enabled', attributes: { path: 'foo' } },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain('<sandbox-restarted />');
    expect(xml).toContain('<tab-opened tabId="t_2" url="https://b.com" />');
    expect(xml).toContain('<skill-enabled path="foo" />');
    expect(xml).toMatch(/^<env-changes>\n.*\n<\/env-changes>$/s);
  });

  it('wraps body in CDATA when it contains < or &', () => {
    const entries: EnvironmentChangeEntry[] = [
      {
        type: 'agents-md-updated',
        detail: 'use <b>bold</b> & italic',
      },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain('<![CDATA[use <b>bold</b> & italic]]>');
  });

  it('does not wrap body in CDATA when no special chars', () => {
    const entries: EnvironmentChangeEntry[] = [
      { type: 'tab-closed', summary: 'tab closed' },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).not.toContain('CDATA');
    expect(xml).toContain('>tab closed</tab-closed>');
  });

  it('escapes ]]> within CDATA body', () => {
    const entries: EnvironmentChangeEntry[] = [
      {
        type: 'test',
        summary: 'has ]]> in <content>',
      },
    ];
    const xml = renderEnvironmentChangesXml(entries);
    expect(xml).toContain(']]]]><![CDATA[>');
  });
});
