import { describe, expect, it } from 'vitest';
import {
  SANDBOX_DOMAIN_SCHEMA_VERSION,
  createSandboxDomainAdapter,
} from './sandbox-domain-adapter';

describe('createSandboxDomainAdapter', () => {
  it('reports the expected contract metadata', () => {
    const adapter = createSandboxDomainAdapter({ getSessionId: () => null });
    expect(adapter.domainId).toBe('sandboxSessionId');
    expect(adapter.renderOrder).toBe(10);
    expect(adapter.schemaVersion).toBe(SANDBOX_DOMAIN_SCHEMA_VERSION);
  });

  it('renders nothing when there is no session and no prior state', () => {
    const adapter = createSandboxDomainAdapter({ getSessionId: () => null });
    expect(adapter.renderState(null, null)).toBe('');
  });

  it('renders the full session tag as the keyframe', () => {
    const adapter = createSandboxDomainAdapter({ getSessionId: () => 'sb-1' });
    const curr = adapter.getState('agent-1') as string;
    expect(adapter.renderState(null, curr)).toBe('<sandbox session="sb-1" />');
  });

  it('emits sandbox-restarted on id transition', () => {
    const adapter = createSandboxDomainAdapter({ getSessionId: () => 'sb-2' });
    const curr = adapter.getState('agent-1') as string;
    const diff = adapter.renderState('sb-1', curr);
    expect(diff).toContain('sandbox-restarted');
  });

  it('uses identity equality, not deep equality', () => {
    const adapter = createSandboxDomainAdapter({ getSessionId: () => null });
    expect(adapter.equals?.('a', 'a')).toBe(true);
    expect(adapter.equals?.('a', 'b')).toBe(false);
    expect(adapter.equals?.(null, null)).toBe(true);
  });

  it('exposes a non-empty promptSection covering sandbox keywords', () => {
    const adapter = createSandboxDomainAdapter({ getSessionId: () => null });
    expect(adapter.promptSection).toBeTruthy();
    const section = adapter.promptSection ?? '';
    expect(section).toContain('Sandbox');
    expect(section).toContain('API.output');
    expect(section).toContain('API.sendCDP');
  });
});
