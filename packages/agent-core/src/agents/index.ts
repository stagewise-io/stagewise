/**
 * Barrel for `@stagewise/agent-core/agents`.
 *
 * Ships the host-extensible agent registry, `BaseAgent`, concrete chat
 * agents, and shared helpers used by the agent loop.
 */
export {
  AgentTypeRegistry,
  type AgentTypeMap,
  type AgentCtor,
} from './agents-registry';
export type { AgentMessage, AgentToolUIPart } from '../types/agent';
export { type AgentsMap, toAgentsMap } from './agents-map';
export {
  BaseAgent,
  type AgentNotificationEvent,
  type BaseAgentConfig,
  type BaseAgentDependencies,
  type BaseAgentToolboxView,
  type BaseAgentCaches,
  type BaseAgentStatic,
  type AgentConfig,
  type MessageId,
} from './base-agent';
export { ChatAgent } from './chat/chat';
export {
  WorkspaceMdAgent,
  type WorkspaceMdInstanceConfig,
} from './workspace-md/workspace-md';

// Shared helpers used across agent classes. Migrated from
// `apps/browser/src/backend/agents/shared/base-agent/` in Phase 10 task 7.
export { default as specialTokens } from './shared/special-tokens';
export {
  extractSlashIdsFromText,
  redactSlashIdsForTelemetry,
  inlineSlashLinksAsText,
  resolveSlashSkill,
  renderSlashCommandXml,
  type ResolvedSlashCommand,
} from './shared/metadata-converter/slash-items';
export { stripStrictFromToolSet } from './shared/strip-strict-from-tools';
export { reasoningSourcesMatch } from './shared/reasoning-signatures';
export { clearPendingApproval } from './shared/pending-approvals-cleanup';
export {
  repairToolCall,
  type RepairToolCallArgs,
} from './shared/repair-tool-call';
export {
  deepMergeProviderOptions,
  type ProviderOptions,
} from './shared/provider-options';
export { MessageCacheAnalyzer } from './shared/message-cache-analyzer';
export { generateSimpleTitle } from './shared/title-generation';
export {
  generateSimpleCompressedHistory,
  convertAgentMessagesToCompactMessageHistoryString,
  estimateMessageTokens,
  COMPRESSION_SYSTEM_PROMPT,
  COMPRESSION_TARGET_CHARS,
  buildCompressionUserMessage,
  defineToolPartSerializers,
  type TypedToolPartSerializers,
} from './shared/history-compression';
export {
  convertAgentMessagesToModelMessages,
  stripUnderscoreProperties,
  capitalizeFirstLetter,
  type BlobReader,
  type ContentLimits,
  type ConvertibleMessageMetadata,
  type ConvertAgentMessagesOptions,
  type ExtraMentionRenderer,
} from './shared/message-conversion';
