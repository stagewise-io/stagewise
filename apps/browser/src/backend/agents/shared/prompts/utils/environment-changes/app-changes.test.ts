import { describe, it, expect } from 'vitest';
import { computeAppChanges } from './app-changes';

describe('computeAppChanges', () => {
  it('returns empty array when both are null', () => {
    expect(computeAppChanges(null, null)).toEqual([]);
  });

  it('returns empty array when app is unchanged', () => {
    const app = { appId: 'viewer', pluginId: 'figma-plugin' };
    expect(computeAppChanges(app, app)).toEqual([]);
  });

  it('returns empty array when app is unchanged (no pluginId)', () => {
    const app = { appId: 'my-app' };
    expect(computeAppChanges(app, app)).toEqual([]);
  });

  it('app-opened carries appId and pluginId attributes', () => {
    const result = computeAppChanges(null, {
      appId: 'viewer',
      pluginId: 'figma-plugin',
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('app-opened');
    expect(result[0].attributes).toEqual({
      appId: 'viewer',
      pluginId: 'figma-plugin',
    });
    expect(result[0].summary).toBeUndefined();
  });

  it('app-opened without pluginId omits pluginId attribute', () => {
    const result = computeAppChanges(null, { appId: 'my-app' });
    expect(result[0].attributes).toEqual({ appId: 'my-app' });
  });

  it('app-closed carries appId and pluginId attributes', () => {
    const result = computeAppChanges(
      { appId: 'viewer', pluginId: 'figma-plugin' },
      null,
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('app-closed');
    expect(result[0].attributes).toEqual({
      appId: 'viewer',
      pluginId: 'figma-plugin',
    });
  });

  it('app-closed without pluginId omits pluginId attribute', () => {
    const result = computeAppChanges({ appId: 'my-app' }, null);
    expect(result[0].attributes).toEqual({ appId: 'my-app' });
  });

  it('app-changed carries from/to as appId:pluginId strings', () => {
    const result = computeAppChanges(
      { appId: 'old-app', pluginId: 'p1' },
      { appId: 'new-app', pluginId: 'p2' },
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('app-changed');
    expect(result[0].attributes).toEqual({
      from: 'old-app:p1',
      to: 'new-app:p2',
    });
  });

  it('app-changed from plugin app to self-built omits pluginId in to', () => {
    const result = computeAppChanges(
      { appId: 'viewer', pluginId: 'figma-plugin' },
      { appId: 'my-app' },
    );
    expect(result[0].attributes).toEqual({
      from: 'viewer:figma-plugin',
      to: 'my-app',
    });
  });
});
