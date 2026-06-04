import type { ShellSnapshot } from '../schemas';

/**
 * Host-side sink for live shell UI state. The engine pushes manifest and
 * live-output updates through this interface instead of talking to any
 * host state container directly. A host (e.g. the browser) implements it
 * as a thin adapter over its UI state (Karton); a headless host (e.g. the
 * CLI) passes no sink at all and simply gets no live preview.
 *
 * Each method maps 1:1 to a state write the browser previously performed
 * inline, so behavior and timing are preserved exactly.
 */
export interface ShellStreamSink {
  /** Replace the per-agent shell session manifest. */
  setManifest(agentInstanceId: string, snapshot: ShellSnapshot): void;
  /**
   * Publish the latest live terminal-grid snapshot for a tool call. The
   * host stores it (the browser wraps it as a single-element array under
   * `pendingShellOutputs[toolCallId]`).
   */
  publishLiveOutput(
    agentInstanceId: string,
    toolCallId: string,
    output: string,
  ): void;
  /** Clear only the live-output entry for a tool call (manifest untouched). */
  clearLiveOutput(agentInstanceId: string, toolCallId: string): void;
  /**
   * Publish the session id for an in-flight tool call so the UI can cancel
   * it.
   */
  publishSessionId(
    agentInstanceId: string,
    toolCallId: string,
    sessionId: string,
  ): void;
  /**
   * Clear both the live-output and pending-session-id entries for a tool
   * call. Implementations may no-op when nothing is pending.
   */
  clearPending(agentInstanceId: string, toolCallId: string): void;
}
