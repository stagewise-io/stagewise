/**
 * Browser-host environment state schemas. These describe the `state`
 * payloads persisted under `metadata.envState[domainId]` for the four
 * host-owned `DomainAdapter`s: `browser`, `shells`, `activeApp`,
 * `logIngest`.
 *
 * They live in `shared/` (and not under `backend/`) because both backend
 * code (`env-domains/*-domain-adapter.ts`) and UI code (`shared/env-metadata.ts`,
 * chat history components) read them. agent-core does not see them — the
 * domain registry treats `state` as opaque.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Browser tabs
// ---------------------------------------------------------------------------

export const browserTabSnapshotSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
  consoleErrorCount: z.number().optional(),
  consoleLogCount: z.number().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string().optional(),
    })
    .nullable()
    .optional(),
  lastFocusedAt: z.number().optional(),
});
export type BrowserTabSnapshot = z.infer<typeof browserTabSnapshotSchema>;

export const browserSnapshotSchema = z.object({
  tabs: z.array(browserTabSnapshotSchema),
  activeTabId: z.string().nullable(),
});
export type BrowserSnapshot = z.infer<typeof browserSnapshotSchema>;

/**
 * Persisted `state` payload for the `browser` domain adapter. Bundles the
 * connected-browser session id alongside the tab list so a single domain
 * change-detection check covers both signals.
 */
export const browserDomainStateSchema = z.object({
  browserSessionId: z.string().nullable(),
  browser: browserSnapshotSchema,
});
export type BrowserDomainState = z.infer<typeof browserDomainStateSchema>;

// ---------------------------------------------------------------------------
// Active app
// ---------------------------------------------------------------------------

export const activeAppSnapshotSchema = z
  .object({
    appId: z.string(),
    pluginId: z.string().optional(),
  })
  .nullable();
export type ActiveAppSnapshot = z.infer<typeof activeAppSnapshotSchema>;

// ---------------------------------------------------------------------------
// Shells
// ---------------------------------------------------------------------------

export const shellSessionSnapshotSchema = z.object({
  id: z.string(),
  exited: z.boolean(),
  exitCode: z.number().nullable(),
  lineCount: z.number(),
  logPath: z.string(),
  tailContent: z.string().optional(),
  lastLine: z.string().optional(),
  cwd: z.string(),
  createdAt: z.number(),
});
export type ShellSessionSnapshot = z.infer<typeof shellSessionSnapshotSchema>;

export const shellSnapshotSchema = z.object({
  sessions: z.array(shellSessionSnapshotSchema),
});
export type ShellSnapshot = z.infer<typeof shellSnapshotSchema>;

// ---------------------------------------------------------------------------
// Log ingest
// ---------------------------------------------------------------------------

export const logIngestSnapshotSchema = z
  .object({ port: z.number(), token: z.string() })
  .nullable();
export type LogIngestSnapshot = z.infer<typeof logIngestSnapshotSchema>;

// ---------------------------------------------------------------------------
// Sandbox session id
// ---------------------------------------------------------------------------

export const sandboxSessionIdStateSchema = z.string().nullable();
export type SandboxSessionIdState = z.infer<typeof sandboxSessionIdStateSchema>;
