import type { AgentStore } from '../../../store/agent-store';
import type { DomainId, EnvStateEntry } from '../../../env/contract';
import type {
  AttachmentMetadata,
  UserMessageMetadata,
} from '../../../types/metadata';
import { updateAgentInstanceState } from './internal';

/**
 * Per-message metadata writes. Each call wraps exactly one
 * `store.update()`.
 */

/**
 * Append attachments produced by host-side tool calls during the
 * current step (e.g. a sandbox/runtime side-channel) onto the last
 * assistant message. Element type is `AttachmentMetadata`, the core
 * schema underlying `UserMessageMetadata['attachments']`. Host
 * overlays extend (never narrow) the attachment shape.
 */
export function attachAttachmentsToLastAssistant(
  store: AgentStore,
  agentInstanceId: string,
  args: { attachments: AttachmentMetadata[] },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const last = state.history[state.history.length - 1];
    if (last?.role === 'assistant') {
      last.metadata ??= {
        createdAt: new Date(),
        partsMetadata: [],
      } as unknown as UserMessageMetadata;
      const md = last.metadata as UserMessageMetadata;
      md.attachments = [...(md.attachments ?? []), ...args.attachments];
    }
  });
}

/**
 * Attach per-domain env-state entries to the target user message.
 * Each entry carries the full `state`, plus a frozen `renderedState`
 * (full-state render) and `renderedStateChange` (diff render). Only
 * domains whose state changed (or that had no prior state) are
 * included; unchanged domains are inherited from earlier messages via
 * `resolveEffectiveEnvStates` at prompt-prep time.
 *
 * Calls with an empty `entries` map short-circuit before opening a
 * store update.
 */
export function attachEnvState(
  store: AgentStore,
  agentInstanceId: string,
  args: { entries: Map<DomainId, EnvStateEntry>; queueFlushStart?: number },
): void {
  if (args.entries.size === 0) return;
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const targetIdx =
      args.queueFlushStart !== undefined &&
      args.queueFlushStart < state.history.length
        ? args.queueFlushStart
        : state.history.length - 1;
    const target = state.history[targetIdx];
    if (!target) return;

    target.metadata ??= {
      createdAt: new Date(),
      partsMetadata: [],
    } as unknown as UserMessageMetadata;
    const md = target.metadata as UserMessageMetadata;
    const envState: NonNullable<UserMessageMetadata['envState']> = {
      ...(md.envState ?? {}),
    };
    for (const [domainId, entry] of args.entries) {
      envState[domainId] = entry;
    }
    md.envState = envState;
  });
}

/**
 * Write `pathReferences` onto multiple user-message metadata slots in
 * a single transaction.
 */
export function setUserPathReferences(
  store: AgentStore,
  agentInstanceId: string,
  args: {
    populated: Array<{
      idx: number;
      pathReferences: Record<string, string> | undefined;
    }>;
  },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    for (const { idx, pathReferences } of args.populated) {
      const target = state.history[idx];
      if (!target) continue;
      target.metadata ??= {
        createdAt: new Date(),
        partsMetadata: [],
      } as unknown as UserMessageMetadata;
      (target.metadata as UserMessageMetadata).pathReferences = pathReferences;
    }
  });
}

/**
 * Merge `pathReferences` into the assistant message at `targetIdx`.
 * Existing keys are preserved unless overridden.
 */
export function mergeAssistantPathReferences(
  store: AgentStore,
  agentInstanceId: string,
  args: { targetIdx: number; references: Record<string, string> },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const target = state.history[args.targetIdx];
    if (!target || target.role !== 'assistant') return;
    target.metadata ??= {
      createdAt: new Date(),
      partsMetadata: [],
    } as unknown as UserMessageMetadata;
    const md = target.metadata as UserMessageMetadata;
    md.pathReferences = {
      ...(md.pathReferences ?? {}),
      ...args.references,
    };
  });
}
