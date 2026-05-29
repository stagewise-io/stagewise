/**
 * Host-only helpers for the agent message pipeline.
 *
 * The core implementation lives in `@stagewise/agent-core/agents`
 * (`shared/message-conversion`). This module only exposes browser-specific
 * mention rendering injected into `BaseAgentDependencies.renderExtraMention`.
 */
import type { TabMentionMeta } from '@shared/karton-contracts/ui/agent/metadata';
import { tabMentionToContextSnippet } from '../prompts/utils/metadata-converter/mentions';

/**
 * Render host-only mention types. Currently only browser tab mentions
 * are routed through this callback — file/workspace mentions are
 * handled by the core `pathReferences` pipeline.
 */
export const renderBrowserExtraMention = (mention: {
  providerType: string;
  [key: string]: unknown;
}): string | null => {
  if (mention.providerType === 'tab') {
    return tabMentionToContextSnippet(mention as unknown as TabMentionMeta);
  }
  return null;
};
