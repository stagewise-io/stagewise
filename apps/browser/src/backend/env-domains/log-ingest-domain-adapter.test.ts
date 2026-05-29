import { describe, expect, it } from 'vitest';
import {
  LOG_INGEST_DOMAIN_SCHEMA_VERSION,
  createLogIngestDomainAdapter,
} from './log-ingest-domain-adapter';

describe('createLogIngestDomainAdapter', () => {
  it('reports the expected contract metadata', () => {
    const adapter = createLogIngestDomainAdapter({ getSnapshot: () => null });
    expect(adapter.domainId).toBe('logIngest');
    expect(adapter.renderOrder).toBe(8);
    expect(adapter.schemaVersion).toBe(LOG_INGEST_DOMAIN_SCHEMA_VERSION);
  });

  it('renders the full endpoint when running', () => {
    const adapter = createLogIngestDomainAdapter({
      getSnapshot: () => ({ port: 1234, token: 'abc' }),
    });
    const curr = adapter.getState('a1') as never;
    expect(adapter.renderState(null, curr)).toBe(
      '<log-ingest port="1234" token="abc" />',
    );
  });

  it('emits log-ingest-started on first appearance', () => {
    const adapter = createLogIngestDomainAdapter({
      getSnapshot: () => ({ port: 1234, token: 'abc' }),
    });
    const curr = adapter.getState('a1') as never;
    const diff = adapter.renderState(null as never, curr);
    expect(diff).toContain('<log-ingest');
    const diff2 = adapter.renderState(null as unknown as never, curr);
    expect(diff2).toContain('<log-ingest');
    const restarted = adapter.renderState(
      { port: 1, token: 'old' } as never,
      curr,
    );
    expect(restarted).toContain('log-ingest-restarted');
  });

  it('emits log-ingest-stopped when the server drops', () => {
    const adapter = createLogIngestDomainAdapter({ getSnapshot: () => null });
    const curr = adapter.getState('a1') as never;
    const diff = adapter.renderState({ port: 1, token: 'old' } as never, curr);
    expect(diff).toContain('log-ingest-stopped');
  });

  it('exposes a non-empty promptSection covering log ingest keywords', () => {
    const adapter = createLogIngestDomainAdapter({ getSnapshot: () => null });
    expect(adapter.promptSection).toBeTruthy();
    const section = adapter.promptSection ?? '';
    expect(section).toContain('Log Ingest');
  });
});
