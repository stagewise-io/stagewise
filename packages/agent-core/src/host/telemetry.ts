/**
 * Loose telemetry sink consumed by `@stagewise/agent-core`.
 *
 * Agent-core must be able to emit events and exceptions without knowing
 * the host's event taxonomy. Event names are plain strings; properties
 * are an opaque `Record<string, unknown>`. The host's adapter is
 * responsible for coercing, filtering, or dropping events whose names
 * do not match its strict typing.
 *
 * `AgentHost.telemetry` is optional per SPEC §Host Interface; agent-core
 * callers must null-check (`host.telemetry?.capture(...)`).
 *
 * ## Event taxonomy emitted by `BaseAgent`
 *
 * The following event names are currently emitted by `BaseAgent` and
 * its subclasses. Names are intentionally kept as plain strings — hosts
 * may type them narrowly in their own adapter if desired.
 *
 * - `agent-message-queued` — User message accepted into the agent's
 *   pending-message queue. Emitted at queue time, before the run loop
 *   picks the message up.
 * - `agent-queue-flushed` — Pending-message queue drained and merged
 *   into the next step's input. Emitted exactly once per drain.
 * - `agent-step-completed` — A single agent step (one `streamText`
 *   invocation) finished, regardless of outcome. Carries timing, token
 *   usage, finish reason, and model id.
 * - `tool-approval-requested` — A tool call was intercepted and is
 *   waiting on user approval. Emitted once when the approval UI is
 *   surfaced.
 * - `tool-approved` — User approved a previously-requested tool call.
 * - `tool-denied` — User denied a previously-requested tool call.
 * - `tool-call-executed` — A tool call finished executing (either
 *   approved-then-run, or auto-run). Carries tool name, duration, and
 *   success/error status. Emitted on both the success and error paths.
 * - `usage-warning-shown` — Soft usage warning displayed to the user
 *   when approaching a quota/limit.
 * - `usage-limit-reached` — Hard usage limit hit; the run is halted.
 * - `upstream-overload` — Provider returned an overload / rate-limit
 *   signal causing the run to back off or abort.
 *
 * Host adapters may receive additional event names from future code
 * paths; the contract is that unknown names must not throw.
 */
export interface TelemetrySink {
  capture(eventName: string, properties?: Record<string, unknown>): void;
  captureException(error: Error, properties?: Record<string, unknown>): void;
  /**
   * Host-resolved telemetry verbosity. `BaseAgent` consults this to gate
   * expensive payload work (e.g. `JSON.stringify` of large tool inputs)
   * before passing properties through to {@link capture}.
   *
   * Treat any value other than `'full'` as the minimum level. Hosts that
   * do not differentiate verbosity can omit the field — agent-core gates
   * fall back to the minimum level.
   */
  readonly level?: 'minimum' | 'full';
}
