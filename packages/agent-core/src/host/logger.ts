/**
 * Structural logging contract consumed by `@stagewise/agent-core`.
 *
 * The four methods (`debug`, `info`, `warn`, `error`) match the lowest
 * common denominator of popular Node.js loggers (winston, pino, bunyan,
 * the browser-app `Logger` class). agent-core never constructs a
 * concrete logger — the host supplies one via `AgentHost.logger`.
 *
 * Signatures are structurally compatible with winston so the browser's
 * existing `Logger` class satisfies this interface without any adapter.
 * The `...args` rest parameter accepts metadata objects, format-string
 * arguments, or nothing at all; implementations MAY ignore them.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  /**
   * Optional fast-path flag indicating whether debug-level logging is
   * enabled. When `undefined`, callers should assume debug logging is
   * active (i.e. emit the log). Implementations backed by a configurable
   * log level SHOULD set this to `false` to let performance-sensitive
   * callers skip expensive formatting.
   */
  readonly isDebugEnabled?: boolean;
}
