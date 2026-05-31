import type { DomainAdapterRegistry } from '../../../env/contract';
import type {
  AgentHost,
  OutputAlias,
  OutputProtocol,
} from '../../../host/host';
import type { AgentTypes } from '../../../types/agent';
import IntroDefault from '../prompts/intro.md?raw';
import SoulDefault from '../prompts/soul.md?raw';
import EnvPreambleDefault from '../prompts/environment-preamble.md?raw';
import OutputStyleBasics from '../prompts/output-style-basics.md?raw';
import AuthoritiesDefault from '../prompts/authorities.md?raw';
import {
  BASELINE_OUTPUT_ALIASES,
  BASELINE_OUTPUT_PROTOCOLS,
} from './output-style-defaults';

export interface BuildChatSystemPromptArgs {
  host: AgentHost;
  domainAdapterRegistry: DomainAdapterRegistry;
  /**
   * The agent type whose profile drives env-section filtering and the
   * host-specific protocols/aliases/fragments. The chat agent passes
   * `this.agentType` (i.e. `AgentTypes.CHAT`) here; thin agents that
   * don't use this builder are unaffected.
   */
  agentType: AgentTypes;
}

/**
 * Compose the chat agent's system prompt from the host's
 * {@link AgentProfile} for the running agent type, the per-domain
 * prompt sections supplied by registered {@link DomainAdapter}s, and
 * the core baselines.
 *
 * Layout:
 *
 * 1. **Intro** — `profile.systemPromptFragments.intro` or agent-core default.
 * 2. **`<soul>`** — `profile.systemPromptFragments.soul` or default.
 * 3. **`<environment>`** —
 *    - core env preamble (state/events semantics, visual perception)
 *    - optional host environment preamble (cross-cutting wording)
 *    - per-adapter `promptSection`s in `renderOrder`, filtered to
 *      `profile.envDomainIds`
 * 4. **`<output-style>`** —
 *    - core output-style basics (formatting, math, IDs)
 *    - protocol table = `BASELINE_OUTPUT_PROTOCOLS` + `profile.outputProtocols`
 *    - alias table = `BASELINE_OUTPUT_ALIASES` + `profile.outputAliases`
 * 5. **`<authorities>`** — `profile.systemPromptFragments.authorities` or default.
 *
 * Profile content is appended after the agent-core baseline so the
 * baseline is always present, even when the host registers no profile
 * (in which case the agent gets the baseline-only prompt and no env
 * adapter sections).
 */
export function buildChatSystemPrompt(args: BuildChatSystemPromptArgs): string {
  const profile = args.host.getAgentProfile(args.agentType);
  const fragments = profile?.systemPromptFragments ?? {};
  const allowedDomainIds = new Set<string>(profile?.envDomainIds ?? []);
  const adapterSections =
    allowedDomainIds.size === 0
      ? []
      : args.domainAdapterRegistry
          .listSorted()
          .filter((adapter) => allowedDomainIds.has(adapter.domainId))
          .map((adapter) => adapter.promptSection?.trim())
          .filter((s): s is string => !!s && s.length > 0);

  const protocols: readonly OutputProtocol[] = [
    ...BASELINE_OUTPUT_PROTOCOLS,
    ...(profile?.outputProtocols ?? []),
  ];
  const aliases: readonly OutputAlias[] = [
    ...BASELINE_OUTPUT_ALIASES,
    ...(profile?.outputAliases ?? []),
  ];

  const environmentBody = [
    EnvPreambleDefault.trim(),
    fragments.environmentPreamble?.trim() ?? '',
    ...adapterSections,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  const outputStyleBody = [
    OutputStyleBasics.trim(),
    renderProtocolsTable(protocols),
    renderAliasesTable(aliases),
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  return [
    fragments.intro ?? IntroDefault,
    `<soul>\n${fragments.soul ?? SoulDefault}\n</soul>`,
    `<environment>\n${environmentBody}\n</environment>`,
    `<output-style>\n${outputStyleBody}\n</output-style>`,
    `<authorities>\n${fragments.authorities ?? AuthoritiesDefault}\n</authorities>`,
  ].join('\n');
}

function renderProtocolsTable(protocols: readonly OutputProtocol[]): string {
  if (protocols.length === 0) return '';
  const rows = protocols.map(
    (p) => `| \`${p.name}\` | \`${p.syntax}\` | ${p.rule} |`,
  );
  return [
    '### Protocols',
    '',
    '| Protocol | Syntax | Rule |',
    '|----------|--------|------|',
    ...rows,
  ].join('\n');
}

function renderAliasesTable(aliases: readonly OutputAlias[]): string {
  if (aliases.length === 0) return '';
  const rows = aliases.map((a) => `| \`${a.alias}\` | ${a.useCase} |`);
  return [
    '### Aliases',
    '',
    'Markdown links with descriptive labels and these alias hrefs render as host-resolved URLs (e.g. `[Report an issue](report-agent-issue)`).',
    '',
    '| Alias | Use Case |',
    '|-------|----------|',
    ...rows,
  ].join('\n');
}
