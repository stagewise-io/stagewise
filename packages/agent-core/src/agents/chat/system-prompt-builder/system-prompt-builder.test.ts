import { describe, expect, it } from 'vitest';
import { DomainAdapterRegistry } from '../../../env/contract';
import type { DomainAdapter } from '../../../env/contract';
import type {
  AgentHost,
  OutputAlias,
  OutputProtocol,
} from '../../../host/host';
import { createTestAgentHost } from '../../../host/test-utils';
import {
  BASELINE_OUTPUT_ALIASES,
  BASELINE_OUTPUT_PROTOCOLS,
} from './output-style-defaults';
import { buildChatSystemPrompt } from './system-prompt-builder';

interface HostOverrides {
  outputProtocols?: readonly OutputProtocol[];
  outputAliases?: readonly OutputAlias[];
  systemPromptFragments?: Partial<
    Record<'intro' | 'soul' | 'environmentPreamble' | 'authorities', string>
  >;
}

function makeEmptyHost(overrides: HostOverrides = {}): AgentHost {
  const host = createTestAgentHost();
  for (const protocol of overrides.outputProtocols ?? []) {
    host.registerOutputProtocol(protocol);
  }
  for (const alias of overrides.outputAliases ?? []) {
    host.registerOutputAlias(alias);
  }
  for (const [key, value] of Object.entries(
    overrides.systemPromptFragments ?? {},
  )) {
    if (typeof value === 'string') {
      host.setSystemPromptFragment(
        key as 'intro' | 'soul' | 'environmentPreamble' | 'authorities',
        value,
      );
    }
  }
  return host;
}

function makeAdapter(
  domainId: string,
  renderOrder: number,
  promptSection: string | undefined,
): DomainAdapter {
  return {
    domainId,
    renderOrder,
    promptSection,
    getState: () => ({}),
    renderState: () => '',
  } as DomainAdapter;
}

describe('buildChatSystemPrompt', () => {
  it('emits the agent-core baseline when the host provides no overrides and no adapters are registered', () => {
    const host = makeEmptyHost();
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
    });

    expect(prompt).toContain('<soul>');
    expect(prompt).toContain('</soul>');
    expect(prompt).toContain('<environment>');
    expect(prompt).toContain('</environment>');
    expect(prompt).toContain('<output-style>');
    expect(prompt).toContain('</output-style>');
    expect(prompt).toContain('<authorities>');
    expect(prompt).toContain('</authorities>');

    expect(prompt).toContain('## State & Events');
    expect(prompt).toContain('## Visual Perception');

    for (const proto of BASELINE_OUTPUT_PROTOCOLS) {
      expect(prompt).toContain(`\`${proto.name}\``);
      expect(prompt).toContain(proto.syntax);
    }
    for (const alias of BASELINE_OUTPUT_ALIASES) {
      expect(prompt).toContain(`\`${alias.alias}\``);
    }
  });

  it('contains no browser/sandbox/shell host-flavored wording on a bare host', () => {
    const host = makeEmptyHost();
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
    });
    const forbidden = [
      'browser application',
      'executeSandboxJs',
      'executeShellCommand',
      'API.sendCDP',
      'API.openApp',
      '.textclip',
      '.swdomelement',
    ];
    for (const needle of forbidden) {
      expect(prompt).not.toContain(needle);
    }
  });

  it('renders adapter promptSections sorted by renderOrder, separated by blank lines', () => {
    const host = makeEmptyHost();
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('zlast', 99, '## Zee section\nzee body'));
    registry.register(makeAdapter('afirst', 1, '## Alpha section\nalpha body'));
    registry.register(makeAdapter('bmid', 5, '## Bravo section\nbravo body'));
    registry.register(makeAdapter('cnone', 7, undefined));

    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
    });
    const alphaIdx = prompt.indexOf('## Alpha section');
    const bravoIdx = prompt.indexOf('## Bravo section');
    const zeeIdx = prompt.indexOf('## Zee section');
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(bravoIdx).toBeGreaterThan(alphaIdx);
    expect(zeeIdx).toBeGreaterThan(bravoIdx);
  });

  it('appends host-declared protocols and aliases after baseline ones', () => {
    const host = makeEmptyHost({
      outputProtocols: [
        { name: 'tab', syntax: '[](tab:{id})', rule: 'tab rule' },
        { name: 'shell', syntax: '[](shell:{id})', rule: 'shell rule' },
      ],
      outputAliases: [{ alias: 'host-extra', useCase: 'host alias' }],
    });
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
    });

    const colorIdx = prompt.indexOf('`color`');
    const pathIdx = prompt.indexOf('`path`');
    const tabIdx = prompt.indexOf('`tab`');
    const shellIdx = prompt.indexOf('`shell`');
    expect(colorIdx).toBeGreaterThan(-1);
    expect(pathIdx).toBeGreaterThan(colorIdx);
    expect(tabIdx).toBeGreaterThan(pathIdx);
    expect(shellIdx).toBeGreaterThan(tabIdx);

    const reportIdx = prompt.indexOf('`report-agent-issue`');
    const hostExtraIdx = prompt.indexOf('`host-extra`');
    expect(reportIdx).toBeGreaterThan(-1);
    expect(hostExtraIdx).toBeGreaterThan(reportIdx);
  });

  it('substitutes systemPromptFragments verbatim for intro/soul/environmentPreamble/authorities', () => {
    const host = makeEmptyHost({
      systemPromptFragments: {
        intro: 'INTRO_OVERRIDE',
        soul: 'SOUL_OVERRIDE',
        environmentPreamble: 'ENV_PREAMBLE_OVERRIDE',
        authorities: 'AUTH_OVERRIDE',
      },
    });
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('w', 1, '## Adapter section\nadapter body'));
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
    });

    expect(prompt).toContain('INTRO_OVERRIDE');
    expect(prompt).toContain('<soul>\nSOUL_OVERRIDE\n</soul>');
    expect(prompt).toContain('ENV_PREAMBLE_OVERRIDE');
    expect(prompt).toContain('<authorities>\nAUTH_OVERRIDE\n</authorities>');
    expect(prompt).toContain('## Adapter section');

    const envPreambleIdx = prompt.indexOf('ENV_PREAMBLE_OVERRIDE');
    const adapterIdx = prompt.indexOf('## Adapter section');
    expect(envPreambleIdx).toBeLessThan(adapterIdx);

    expect(prompt).toContain('## State & Events');
  });

  it('still emits the core env preamble even when host omits environmentPreamble', () => {
    const host = makeEmptyHost();
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
    });
    expect(prompt).toContain('## State & Events');
    expect(prompt).toContain('## Visual Perception');
  });
});
