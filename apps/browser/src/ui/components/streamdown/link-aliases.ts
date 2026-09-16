interface AliasVariables {
  agentInstanceId: string;
  appVersion: string;
}

/**
 * Link alias definitions for special markdown links used by agents.
 * Each alias maps to a function that builds the resolved URL.
 */
const LINK_ALIAS_MAP: Record<string, (v: AliasVariables) => string> = {
  'report-agent-issue': (v) =>
    `https://github.com/stagewise-io/stagewise/issues/new?template=5.agent_issue.yml&agent-instance-id=${encodeURIComponent(v.agentInstanceId)}`,
  'request-new-feature': (v) =>
    `https://github.com/stagewise-io/stagewise/issues/new?template=2.feature_request.yml&app-version=${encodeURIComponent(v.appVersion)}`,
  'socials-discord': () => 'https://ade.stagewise.io/socials/discord',
  'socials-x': () => 'https://ade.stagewise.io/socials/x',
  'socials-linkedin': () => 'https://ade.stagewise.io/socials/linkedin',
};

/**
 * Resolves a link alias to its full URL with variable substitution.
 * Returns null if the href is not a known alias.
 */
export function resolveLinkAlias(
  href: string,
  variables: AliasVariables,
): string | null {
  const buildUrl = LINK_ALIAS_MAP[href];
  if (!buildUrl) return null;
  return buildUrl(variables);
}
