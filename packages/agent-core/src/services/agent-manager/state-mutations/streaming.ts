import type { DynamicToolUIPart } from 'ai';
import type { AgentStore } from '../../../store/agent-store';
import type { AgentMessage, AgentToolUIPart } from '../../../types/agent';
import type {
  OwnedReasoningDetails,
  UserMessageMetadata,
} from '../../../types/metadata';
import { updateAgentInstanceState } from './internal';

/**
 * UI-message stream hot path. Each call is exactly one
 * `store.update()`.
 *
 * Tool/part states already considered "settled" by the merge — once a
 * part reports one of these, an incoming part of the same `type` and
 * `state` is treated as a no-change and skipped to avoid clobbering
 * downstream metadata (e.g. `endedAt` timestamps).
 */
const SETTLED_PART_STATES = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'done',
]);

/**
 * Merge an incoming UI message stream chunk into history. The
 * canonical hot path called per streaming tick from `BaseAgent`.
 *
 * Behavior:
 *   - Finds (or pushes) the message by `id`.
 *   - Replaces existing parts that have drifted, skipping
 *     already-settled identical parts.
 *   - Trims the existing parts array to the incoming length.
 *   - Maintains `partsMetadata` startedAt / endedAt for text/reasoning
 *     parts.
 *   - Invokes `onApprovalRequested` for any tool part that enters
 *     `approval-requested`.
 */
export function mergeUIMessageStream(
  store: AgentStore,
  agentInstanceId: string,
  args: {
    uiMessage: AgentMessage;
    onApprovalRequested?: (cb: {
      approvalId: string;
      toolPart: AgentToolUIPart | DynamicToolUIPart;
    }) => void;
  },
): void {
  const { uiMessage, onApprovalRequested } = args;
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const existingMessage =
      state.history.find((message) => message.id === uiMessage.id) ??
      (() => {
        state.history.push(uiMessage);
        return state.history[state.history.length - 1]!;
      })();

    const incoming = uiMessage.parts;
    const existing = existingMessage.parts;
    for (let i = 0; i < incoming.length; i++) {
      if (i >= existing.length) {
        existing.push(incoming[i]!);
      } else {
        const ep = existing[i] as Record<string, unknown>;
        const ip = incoming[i] as Record<string, unknown>;
        if (
          ep.type === ip.type &&
          ep.state === ip.state &&
          SETTLED_PART_STATES.has(ep.state as string)
        )
          continue;
        existing[i] = incoming[i]!;
      }
    }
    if (existing.length > incoming.length) existing.length = incoming.length;

    existingMessage.metadata ??= {
      createdAt: new Date(),
      partsMetadata: [],
    } as unknown as UserMessageMetadata;
    const emMeta = existingMessage.metadata as UserMessageMetadata;
    // Keep `partsMetadata` index-aligned with `parts`. Without this,
    // a shrunk-then-regrown stream reuses a stale `startedAt`/`endedAt`
    // at the recycled index via the `??=` writes below.
    if (emMeta.partsMetadata.length > incoming.length) {
      emMeta.partsMetadata.length = incoming.length;
    }

    uiMessage.parts.forEach(
      (part: (typeof uiMessage.parts)[number], index: number) => {
        if (part.type === 'text' || part.type === 'reasoning') {
          const streamPart = part as { state: string };
          emMeta.partsMetadata[index] ??= {
            startedAt: new Date(),
            endedAt: undefined,
          };
          if (streamPart.state === 'done') {
            emMeta.partsMetadata[index]!.endedAt ??= new Date();
          }
        }

        if (
          (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) &&
          (part as AgentToolUIPart | DynamicToolUIPart).state ===
            'approval-requested'
        ) {
          const toolPart = part as AgentToolUIPart | DynamicToolUIPart;
          const approvalId = toolPart.approval?.id;
          if (approvalId && onApprovalRequested) {
            onApprovalRequested({ approvalId, toolPart });
          }
        }
      },
    );
  });
}

/**
 * Attach a compressed history blob to the boundary message. Returns
 * `'missing'` if the boundary message was archived/removed in the
 * meantime, `'written'` otherwise.
 */
export function storeCompressedHistory(
  store: AgentStore,
  agentInstanceId: string,
  args: { boundaryMessageId: string; compressedHistory: string },
): 'missing' | 'written' {
  let result: 'missing' | 'written' = 'missing';
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const boundaryMessage = state.history.find(
      (m) => m.id === args.boundaryMessageId,
    );
    if (!boundaryMessage) return;
    boundaryMessage.metadata ??= {
      createdAt: new Date(),
      partsMetadata: [],
    } as unknown as UserMessageMetadata;
    const bm = boundaryMessage.metadata as UserMessageMetadata;
    bm.compressedHistory = args.compressedHistory;
    result = 'written';
  });
  return result;
}

/**
 * Set the provider-owned signed reasoning_details on the assistant
 * message at `targetIdx`. Full-replace of the
 * `ownedReasoningDetails` array; the caller merges/appends per-source
 * before invoking.
 */
export function setAssistantOwnedReasoningDetails(
  store: AgentStore,
  agentInstanceId: string,
  args: { targetIdx: number; ownedReasoningDetails: OwnedReasoningDetails[] },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const target = state.history[args.targetIdx];
    if (!target || target.role !== 'assistant') return;
    target.metadata ??= {
      createdAt: new Date(),
      partsMetadata: [],
    } as unknown as UserMessageMetadata;
    (target.metadata as UserMessageMetadata).ownedReasoningDetails =
      args.ownedReasoningDetails;
  });
}
