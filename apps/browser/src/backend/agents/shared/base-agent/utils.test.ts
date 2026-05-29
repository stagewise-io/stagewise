import { describe, expect, it } from 'vitest';
import { renderBrowserExtraMention } from './utils';

describe('renderBrowserExtraMention', () => {
  it('renders tab mentions as attach XML', () => {
    const snippet = renderBrowserExtraMention({
      providerType: 'tab',
      tabId: 'tab-1',
      url: 'https://example.com/',
      title: 'Example',
    });
    expect(snippet).toContain('tab-mention');
    expect(snippet).toContain('tab-1');
    expect(snippet).toContain('https://example.com/');
  });

  it('returns null for non-tab mention kinds', () => {
    expect(
      renderBrowserExtraMention({ providerType: 'workspace', id: 'w1' }),
    ).toBeNull();
  });
});
