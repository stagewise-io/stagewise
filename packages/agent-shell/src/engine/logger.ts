/**
 * Minimal logger interface accepted by the shell engine. Matches the shape
 * of `@stagewise/agent-core/host`'s `Logger` (and the browser's winston
 * logger), so both hosts can pass their logger without an adapter.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
