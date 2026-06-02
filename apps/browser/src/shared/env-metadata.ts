/**
 * UI-side helpers for reading the env-state slice of a message's
 * metadata. The agent persists per-domain entries on each user message
 * via {@link DomainAdapterRegistry.captureAll}; the UI walks history
 * backward to surface the most recently captured state per domain.
 */
import type {
  BrowserDomainState,
  BrowserTabSnapshot,
} from '@shared/env-domain-schemas';
import type { Mount } from '@stagewise/agent-core/types/metadata';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';

type MessageWithEnvMetadata = {
  metadata?: UserMessageMetadata;
};

/**
 * Resolve the mount list visible to the agent at the time `msg` was
 * captured. Mirrors the on-disk shape produced by the core
 * `workspace` {@link DomainAdapter}.
 */
export function getWorkspaceMountsFromMessage(
  msg: MessageWithEnvMetadata | undefined,
): Mount[] | undefined {
  const entry = msg?.metadata?.envState?.workspace;
  if (!entry) return undefined;
  const state = entry.state as { mounts?: Mount[] } | undefined;
  return state?.mounts;
}

/**
 * Walk history backward from `upToIndex` and reconstruct the
 * `browserSessionId` + open-tabs map that was visible at that point in
 * the conversation. Looks at the persisted `browser` domain entry
 * stamped by the browser host adapter; falls back to `null` slots when
 * the entry is missing (e.g. legacy messages captured before Phase 4).
 */
export function resolveBrowserContextFromMessages(
  messages: readonly MessageWithEnvMetadata[],
  upToIndex: number,
): {
  browserSessionId: string | null;
  tabs: Map<string, BrowserTabSnapshot> | null;
} {
  let browserSessionId: string | null = null;
  let tabs: Map<string, BrowserTabSnapshot> | null = null;

  for (let i = upToIndex; i >= 0; i--) {
    const entry = messages[i]?.metadata?.envState?.browser;
    if (!entry) continue;
    const state = entry.state as BrowserDomainState | undefined;
    if (!state) continue;
    if (browserSessionId === null && state.browserSessionId !== undefined) {
      browserSessionId = state.browserSessionId;
    }
    if (tabs === null && state.browser?.tabs) {
      tabs = new Map(state.browser.tabs.map((t) => [t.id, t]));
    }
    if (browserSessionId !== null && tabs !== null) break;
  }

  return { browserSessionId, tabs };
}
