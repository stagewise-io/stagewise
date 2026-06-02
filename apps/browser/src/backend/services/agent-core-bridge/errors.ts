import type { CommandName } from '@stagewise/agent-core';

/**
 * Thrown at `AgentCoreBridge.attach()` time when a procedure listed in the
 * contract map (`MIGRATED_PROCEDURES`) has no matching handler registered
 * in the `CommandRegistry`.
 *
 * Surfaces registry/contract drift as a fail-fast at startup per D-KB-5
 * rather than a silent runtime gap when the UI eventually calls the
 * procedure.
 */
export class BridgeDriftError extends Error {
  readonly procedure: CommandName;

  constructor(procedure: CommandName) {
    super(
      `KartonBridge drift: procedure "${procedure}" has no command handler`,
    );
    this.name = 'BridgeDriftError';
    this.procedure = procedure;
  }
}

/**
 * Sanitizes a handler rejection for Karton transport.
 *
 * Karton serializes `.name` + `.message` across the wire. Stripping
 * `.stack` and non-standard fields keeps the UI-visible error identical
 * to today's direct-handler behaviour (D-KB-4).
 */
export function serializeHandlerError(err: unknown): Error {
  if (err instanceof Error) {
    const out = new Error(err.message);
    out.name = err.name;
    return out;
  }
  return new Error(String(err));
}
