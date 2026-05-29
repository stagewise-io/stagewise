import type { DomainAdapterRegistry } from '../../../env/contract';
import type {
  AgentHost,
  OutputAlias,
  OutputProtocol,
} from '../../../host/host';
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
}

/**
 * Compose the chat agent's system prompt from host-injected fragments
 * and the per-domain prompt sections supplied by registered
 * {@link DomainAdapter}s.
 *
 * Layout:
 *
 * 1. **Intro** — `host.getSystemPromptFragments().intro` or agent-core default.
 * 2. **`<soul>`** — `host.getSystemPromptFragments().soul` or default.
 * 3. **`<environment>`** —
 *    - core env preamble (state/events semantics, visual perception)
 *    - optional host environment preamble (cross-cutting wording)
 *    - per-adapter `promptSection`s in `renderOrder`
 * 4. **`<output-style>`** —
 *    - core output-style basics (formatting, math, IDs)
 *    - protocol table = `BASELINE_OUTPUT_PROTOCOLS` + `host.getOutputProtocols()`
 *    - alias table = `BASELINE_OUTPUT_ALIASES` + `host.getOutputAliases()`
 * 5. **`<authorities>`** — `host.getSystemPromptFragments().authorities` or default.
 *
 * Host content is appended after the agent-core baseline so the
 * baseline is always present, even on a minimal headless host.
 */
export function buildChatSystemPrompt(args: BuildChatSystemPromptArgs): string {
  const fragments = args.host.getSystemPromptFragments();
  const adapterSections = args.domainAdapterRegistry
    .listSorted()
    .map((adapter) => adapter.promptSection?.trim())
    .filter((s): s is string => !!s && s.length > 0);

  const protocols: readonly OutputProtocol[] = [
    ...BASELINE_OUTPUT_PROTOCOLS,
    ...args.host.getOutputProtocols(),
  ];
  const aliases: readonly OutputAlias[] = [
    ...BASELINE_OUTPUT_ALIASES,
    ...args.host.getOutputAliases(),
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
