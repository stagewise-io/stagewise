export { ShellService } from './shell-service';
export type { ShellStreamSink } from './stream-sink';
export type { Logger } from './logger';
export { DisposableService } from './disposable';
export { SessionManager } from './session-manager';
export { OscParser, wrapWithSentinel } from './osc-parser';
export { SessionLogger } from './session-logger';
export { sanitizeEnv } from './sanitize-env';
export {
  detectShell,
  resolveShellEnv,
  normalizeWindowsPath,
} from './shell-env';
export * from './types';
