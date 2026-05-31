import { describe, expect, it } from 'vitest';
import { DomainAdapterRegistry } from '../../../env/contract';
import type { DomainAdapter } from '../../../env/contract';
import type {
  AgentHost,
  AgentProfile,
  OutputAlias,
  OutputProtocol,
} from '../../../host/host';
import { createTestAgentHost } from '../../../host/test-utils';
import { AgentTypes } from '../../../types/agent';
import {
  BASELINE_OUTPUT_ALIASES,
  BASELINE_OUTPUT_PROTOCOLS,
} from './output-style-defaults';
import { buildChatSystemPrompt } from './system-prompt-builder';

interface ProfileOverrides {
  envDomainIds?: readonly string[];
  outputProtocols?: readonly OutputProtocol[];
  outputAliases?: readonly OutputAlias[];
  systemPromptFragments?: AgentProfile['systemPromptFragments'];
}

/**
 * Build a host whose CHAT profile carries the supplied overrides. The
 * default profile is fully empty (no env domains, no protocols, no
 * aliases, no fragments) so each test asserts only the surface it
 * cares about.
 */
function makeHost(profile: ProfileOverrides = {}): AgentHost {
  const host = createTestAgentHost();
  host.defineAgentProfile(AgentTypes.CHAT, {
    envDomainIds: profile.envDomainIds ?? [],
    outputProtocols: profile.outputProtocols,
    outputAliases: profile.outputAliases,
    systemPromptFragments: profile.systemPromptFragments,
  });
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
  it('emits the agent-core baseline when the host profile is empty', () => {
    const host = makeHost();
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
      agentType: AgentTypes.CHAT,
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

  it('emits only the baseline when the host registered no profile for this agent type', () => {
    const host = createTestAgentHost();
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('w', 1, '## Adapter section\nadapter body'));
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
      agentType: AgentTypes.CHAT,
    });
    expect(prompt).not.toContain('## Adapter section');
    for (const proto of BASELINE_OUTPUT_PROTOCOLS) {
      expect(prompt).toContain(`\`${proto.name}\``);
    }
  });

  it('contains no browser/sandbox/shell host-flavored wording on a bare host', () => {
    const host = makeHost();
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
      agentType: AgentTypes.CHAT,
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

  it('renders adapter promptSections sorted by renderOrder, filtered by profile envDomainIds', () => {
    const host = makeHost({
      envDomainIds: ['zlast', 'afirst', 'bmid', 'cnone'],
    });
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('zlast', 99, '## Zee section\nzee body'));
    registry.register(makeAdapter('afirst', 1, '## Alpha section\nalpha body'));
    registry.register(makeAdapter('bmid', 5, '## Bravo section\nbravo body'));
    registry.register(makeAdapter('cnone', 7, undefined));

    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
      agentType: AgentTypes.CHAT,
    });
    const alphaIdx = prompt.indexOf('## Alpha section');
    const bravoIdx = prompt.indexOf('## Bravo section');
    const zeeIdx = prompt.indexOf('## Zee section');
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(bravoIdx).toBeGreaterThan(alphaIdx);
    expect(zeeIdx).toBeGreaterThan(bravoIdx);
  });

  it('omits adapter promptSections whose domainId is not in the profile envDomainIds', () => {
    const host = makeHost({ envDomainIds: ['allowed'] });
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter('allowed', 1, '## Allowed section\nallowed body'),
    );
    registry.register(
      makeAdapter('blocked', 2, '## Blocked section\nblocked body'),
    );

    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
      agentType: AgentTypes.CHAT,
    });

    expect(prompt).toContain('## Allowed section');
    expect(prompt).not.toContain('## Blocked section');
  });

  it('appends profile-declared protocols and aliases after baseline ones', () => {
    const host = makeHost({
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
      agentType: AgentTypes.CHAT,
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

  it('substitutes profile systemPromptFragments verbatim for intro/soul/environmentPreamble/authorities', () => {
    const host = makeHost({
      envDomainIds: ['w'],
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
      agentType: AgentTypes.CHAT,
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

  it('still emits the core env preamble even when the profile omits environmentPreamble', () => {
    const host = makeHost();
    const registry = new DomainAdapterRegistry();
    const prompt = buildChatSystemPrompt({
      host,
      domainAdapterRegistry: registry,
      agentType: AgentTypes.CHAT,
    });
    expect(prompt).toContain('## State & Events');
    expect(prompt).toContain('## Visual Perception');
  });
});
