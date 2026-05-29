/**
 * Compatibility shim. The canonical implementation now lives in
 * `@stagewise/agent-core/agents`. Kept here so existing browser
 * imports that reference this path continue to work while Phase 10
 * is in flight.
 */
export {
  extractSlashIdsFromText,
  redactSlashIdsForTelemetry,
  inlineSlashLinksAsText,
  resolveSlashSkill,
  renderSlashCommandXml,
  type ResolvedSlashCommand,
} from '@stagewise/agent-core/agents';
