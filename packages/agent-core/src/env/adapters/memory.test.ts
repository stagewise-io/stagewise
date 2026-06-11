import { describe, expect, it } from 'vitest';
import { createMemoryDomainAdapter } from './memory';

describe('createMemoryDomainAdapter', () => {
  it('renders archival memory context without using the compressed-history memory tag', async () => {
    const adapter = createMemoryDomainAdapter();
    const state = await adapter.getState('agent-1');
    const rendered = adapter.renderState(null, state);

    expect(rendered).toContain('<memory-mount>');
    expect(rendered).toContain('</memory-mount>');
    expect(rendered).not.toMatch(/^<memory>$/m);
    expect(rendered).not.toMatch(/^<\/memory>$/m);
    expect(rendered).toContain('Current agent id: agent-1');
    expect(rendered).toContain('Global index: memory/index.md');
    expect(rendered).toContain('Full index registry: memory/index.json');
    expect(rendered).toContain('memory/agents/agent-1/history.md');
    expect(rendered).toContain('memory/agents/agent-1/history.jsonl');
    expect(rendered).toContain('memory/agents/agent-1/metadata.json');
  });

  it('renders env changes when the current agent changes', async () => {
    const adapter = createMemoryDomainAdapter();
    const previous = await adapter.getState('agent-1');
    const current = await adapter.getState('agent-2');
    const rendered = adapter.renderState(previous, current);

    expect(rendered).toContain('<env-changes>');
    expect(rendered).toContain('</env-changes>');
    expect(rendered).toContain('<memory-agent-context');
    expect(rendered).toContain('agent-id="agent-2"');
    expect(rendered).toContain('index="memory/index.md"');
    expect(rendered).toContain(
      'own-history="memory/agents/agent-2/history.md"',
    );
  });

  it('renders nothing when the current agent is unchanged', async () => {
    const adapter = createMemoryDomainAdapter();
    const previous = await adapter.getState('agent-1');
    const current = { ...previous };

    expect(adapter.renderState(previous, current)).toBe('');
  });
});
