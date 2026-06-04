/**
 * Browser host adapter mapping {@link ShellStreamSink} onto Karton UI state.
 *
 * Contains the exact `setState` bodies that previously lived inline inside
 * `ShellService`. The shell engine now lives in `@stagewise/agent-shell`
 * and is host-agnostic; this adapter is the single place that knows about
 * Karton, so the browser's live preview / cancel UX is preserved unchanged.
 */
import type { ShellSnapshot, ShellStreamSink } from '@stagewise/agent-shell';
import type { KartonService } from '@/services/karton';

/** Immer draft type passed to {@link KartonService.setState} recipes. */
type ToolboxDraft = Parameters<Parameters<KartonService['setState']>[0]>[0];

/**
 * Ensure the per-agent toolbox entry exists before writing shell state.
 * Centralized so the bootstrap shape lives in one place.
 */
function ensureToolboxEntry(
  draft: ToolboxDraft,
  agentInstanceId: string,
): void {
  if (!draft.toolbox[agentInstanceId]) {
    draft.toolbox[agentInstanceId] = {
      workspace: { mounts: [] },
      pendingFileDiffs: [],
      editSummary: [],
      pendingUserQuestion: null,
    };
  }
}

/**
 * Build a {@link ShellStreamSink} backed by the given Karton service.
 */
export function createKartonShellStreamSink(
  kartonService: KartonService,
): ShellStreamSink {
  return {
    setManifest(agentInstanceId: string, snapshot: ShellSnapshot): void {
      kartonService.setState((draft) => {
        ensureToolboxEntry(draft, agentInstanceId);
        draft.toolbox[agentInstanceId].shells = snapshot;
      });
    },

    publishLiveOutput(
      agentInstanceId: string,
      toolCallId: string,
      output: string,
    ): void {
      kartonService.setState((draft) => {
        ensureToolboxEntry(draft, agentInstanceId);
        if (!draft.toolbox[agentInstanceId].pendingShellOutputs) {
          draft.toolbox[agentInstanceId].pendingShellOutputs = {};
        }
        draft.toolbox[agentInstanceId].pendingShellOutputs![toolCallId] = [
          output,
        ];
      });
    },

    clearLiveOutput(agentInstanceId: string, toolCallId: string): void {
      kartonService.setState((draft) => {
        const tb = draft.toolbox[agentInstanceId];
        if (tb?.pendingShellOutputs?.[toolCallId]) {
          delete tb.pendingShellOutputs[toolCallId];
        }
      });
    },

    publishSessionId(
      agentInstanceId: string,
      toolCallId: string,
      sessionId: string,
    ): void {
      kartonService.setState((draft) => {
        ensureToolboxEntry(draft, agentInstanceId);
        if (!draft.toolbox[agentInstanceId].pendingShellSessionIds) {
          draft.toolbox[agentInstanceId].pendingShellSessionIds = {};
        }
        draft.toolbox[agentInstanceId].pendingShellSessionIds![toolCallId] =
          sessionId;
      });
    },

    clearPending(agentInstanceId: string, toolCallId: string): void {
      // Read-guard: avoid an unnecessary Karton write when nothing is pending.
      const agentToolbox = kartonService.state.toolbox[agentInstanceId];
      const hasOutputs = !!agentToolbox?.pendingShellOutputs?.[toolCallId];
      const hasSessionId = !!agentToolbox?.pendingShellSessionIds?.[toolCallId];
      if (!hasOutputs && !hasSessionId) return;

      kartonService.setState((draft) => {
        const tb = draft.toolbox[agentInstanceId];
        if (tb?.pendingShellOutputs?.[toolCallId]) {
          delete tb.pendingShellOutputs[toolCallId];
        }
        if (tb?.pendingShellSessionIds?.[toolCallId]) {
          delete tb.pendingShellSessionIds[toolCallId];
        }
      });
    },
  };
}
