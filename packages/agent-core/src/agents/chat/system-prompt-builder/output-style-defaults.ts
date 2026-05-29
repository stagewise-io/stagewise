import type { OutputAlias, OutputProtocol } from '../../../host/host';

/**
 * Baseline markdown link protocols every chat agent emits, regardless
 * of host. These are appended *before* any host-declared protocols in
 * the prompt table so the agent always knows how to format colors and
 * paths even on minimal hosts (e.g. CLI).
 */
export const BASELINE_OUTPUT_PROTOCOLS: readonly OutputProtocol[] = [
  {
    name: 'color',
    syntax: '[](color:rgb(200,100,0))',
    rule: 'Every color mention in normal text. Never inside code blocks.',
  },
  {
    name: 'path',
    syntax: '[](path:{PATH})',
    rule: 'Every reference to files, folders, workspaces, or attachments. Append `?display=expanded` (e.g. `[](path:./README.md?display=expanded)`) for inline preview.',
  },
];

/**
 * Baseline markdown link aliases every chat agent may emit. These
 * resolve to stagewise product URLs in the host UI; hosts that wish
 * to surface them simply implement the alias→URL mapping.
 */
export const BASELINE_OUTPUT_ALIASES: readonly OutputAlias[] = [
  {
    alias: 'report-agent-issue',
    useCase: 'User reports bugs or dissatisfaction with the agent',
  },
  {
    alias: 'request-new-feature',
    useCase: 'User requests unsupported functionality',
  },
  { alias: 'socials-discord', useCase: 'Discord community' },
  { alias: 'socials-x', useCase: 'X (Twitter) profile' },
  { alias: 'socials-linkedin', useCase: 'LinkedIn profile' },
];
