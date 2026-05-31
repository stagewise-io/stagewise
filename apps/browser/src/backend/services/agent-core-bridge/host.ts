import {
  AgentHost,
  AgentTypes,
  type DomainId,
  type HostEnvironmentSources,
  type HostModels,
  type HostPaths,
  type OutputProtocol,
} from '@stagewise/agent-core';
import {
  AGENTS_MD_DOMAIN_ID,
  ENABLED_SKILLS_DOMAIN_ID,
  FILE_DIFFS_DOMAIN_ID,
  PLANS_DOMAIN_ID,
  WORKSPACE_DOMAIN_ID,
} from '@stagewise/agent-core/env/adapters';
// NOTE: import each `*_DOMAIN_ID` from its adapter module directly,
// not via `@/env-domains`. The barrel re-exports adapter factories
// that transitively load the toolbox + terminal stack, which depends
// on Vite-injected `__APP_*` globals and breaks plain-Node test
// loaders. The per-module imports are pure string constants and have
// no side effects.
import { ACTIVE_APP_DOMAIN_ID } from '@/env-domains/active-app-domain-adapter';
import { BROWSER_DOMAIN_ID } from '@/env-domains/browser-domain-adapter';
import { LOG_INGEST_DOMAIN_ID } from '@/env-domains/log-ingest-domain-adapter';
import { SANDBOX_DOMAIN_ID } from '@/env-domains/sandbox-domain-adapter';
import { SHELLS_DOMAIN_ID } from '@/env-domains/shells-domain-adapter';
import type { ModelProviderService } from '@/agents/model-provider';
import type { Logger as BrowserLogger } from '@/services/logger';
import type { TelemetryService } from '@/services/telemetry';
import { createBrowserHostModels } from './host-models';
import { createBrowserHostPaths } from './host-paths';
import { createBrowserTelemetrySink } from './host-telemetry';
import { readWorkspaceMd } from '@/agents/shared/prompts/utils/read-workspace-md';
import { DEFAULT_WORKSPACE_MD_RELATIVE_PATH } from '@stagewise/agent-core/mount-manager';
import { shell } from 'electron';
import { existsSync } from 'node:fs';
import browserIntroPrompt from '@/agents/chat/prompts/intro.md?raw';
import browserSoulPrompt from '@/agents/chat/prompts/soul.md?raw';
import browserEnvironmentPreamblePrompt from '@/agents/chat/prompts/environment-preamble.md?raw';
import { browserToolPartSerializers } from '@/agents/chat/tool-part-serializers';
import { textBlobTransformer } from '@stagewise/agent-core/file-read-transformer';
import type { FileTransformer } from '@stagewise/agent-core';

export interface BrowserAgentHostDeps {
  logger: BrowserLogger;
  telemetryService: TelemetryService;
  /**
   * Optional pre-built `HostPaths`. Supplied when the caller already
   * constructed one earlier in the boot sequence (e.g. to pass into
   * `DiffHistoryService.create` before the full `AgentHost` is
   * assembled). Defaults to a fresh `createBrowserHostPaths()`.
   */
  paths?: HostPaths;
  /**
   * Direct `HostModels` adapter. Supplied when the caller constructed a
   * model surface ahead of time — typically the lazy wrapper from
   * `createLazyBrowserHostModels()` used to thread a partial host into
   * services that boot before `ModelProviderService` exists (Phase 5).
   * Mutually exclusive with `modelProviderService`.
   */
  models?: HostModels;
  /**
   * Convenience entry point used when the caller has the
   * `ModelProviderService` available at construction time. Ignored when
   * `models` is supplied.
   */
  modelProviderService?: ModelProviderService;
  /**
   * Host-owned raw-data feeds consumed by core-owned env-state
   * `DomainAdapter`s (see `packages/agent-core/src/env/adapters/*`).
   * Optional because some callers (tests, early-boot partial hosts)
   * run without the env-state pipeline.
   */
  environmentSources?: HostEnvironmentSources;
}

/**
 * Assembles the browser's concrete `AgentHost` by composing the four
 * thin adapters defined in this directory. This is the single
 * construction site — `main.ts` calls it once, just before
 * `createAgentCoreBridge`.
 *
 * `BrowserLogger` structurally satisfies `agent-core`'s `Logger`
 * interface (both expose `debug/info/warn/error`), so the logger slot
 * is identity-passed without an adapter.
 */
export function createBrowserAgentHost(deps: BrowserAgentHostDeps): AgentHost {
  const paths = deps.paths ?? createBrowserHostPaths();
  const models =
    deps.models ??
    (deps.modelProviderService
      ? createBrowserHostModels(deps.modelProviderService)
      : (() => {
          throw new Error(
            '[BrowserAgentHost] neither `models` nor `modelProviderService` supplied',
          );
        })());
  const host = new AgentHost({
    paths,
    models,
    logger: deps.logger,
    telemetry: createBrowserTelemetrySink(deps.telemetryService, {
      logger: deps.logger,
    }),
    environmentSources: deps.environmentSources,
    desktop: {
      async revealPathInFileManager(absolutePath: string) {
        if (!existsSync(absolutePath)) {
          return `Directory does not exist: ${absolutePath}`;
        }
        return await shell.openPath(absolutePath);
      },
    },
    readWorkspaceMdFromDisk: (workspacePath) =>
      readWorkspaceMd(workspacePath, BROWSER_WORKSPACE_MD_RELATIVE_PATH),
    workspaceMdRelativePath: BROWSER_WORKSPACE_MD_RELATIVE_PATH,
  });
  host.registerFileReadTransformers(BROWSER_FILE_READ_TRANSFORMERS);
  host.registerToolPartSerializers(browserToolPartSerializers);

  // CHAT — the full main-thread experience: every host + core
  // adapter, the browser-specific output protocols, and the
  // browser's intro/soul/environment fragments. Listed explicitly
  // (one entry per registered adapter) so a missing adapter or a
  // renamed domain id surfaces here at the wiring site rather than
  // silently dropping a prompt section.
  host.defineAgentProfile(AgentTypes.CHAT, {
    envDomainIds: BROWSER_CHAT_ENV_DOMAIN_IDS,
    outputProtocols: BROWSER_OUTPUT_PROTOCOLS,
    systemPromptFragments: {
      intro: browserIntroPrompt,
      soul: browserSoulPrompt,
      environmentPreamble: browserEnvironmentPreamblePrompt,
    },
  });

  // WORKSPACE_MD — the thin "edit `.stagewise/WORKSPACE.md` only"
  // agent. It supplies its own system prompt (so prompt fragments
  // are inert here) and only needs the workspace snapshot to
  // resolve mount prefixes against; everything else (browser tabs,
  // shells, sandbox, diffs, plans, ...) is intentionally absent.
  host.defineAgentProfile(AgentTypes.WORKSPACE_MD, {
    envDomainIds: [WORKSPACE_DOMAIN_ID],
  });

  return host;
}

/**
 * Full env-domain allow-list for {@link AgentTypes.CHAT} on the browser
 * host. Composed from the `*_DOMAIN_ID` constants exported by each
 * registered adapter (host-owned `apps/browser/src/backend/env-domains`
 * + core `packages/agent-core/src/env/adapters`) so the source of truth
 * for the id lives next to the adapter, not duplicated here. The set
 * order is informational; the registry's per-adapter `renderOrder`
 * controls prompt-section composition.
 */
const BROWSER_CHAT_ENV_DOMAIN_IDS: readonly DomainId[] = [
  BROWSER_DOMAIN_ID,
  SHELLS_DOMAIN_ID,
  SANDBOX_DOMAIN_ID,
  ACTIVE_APP_DOMAIN_ID,
  LOG_INGEST_DOMAIN_ID,
  WORKSPACE_DOMAIN_ID,
  AGENTS_MD_DOMAIN_ID,
  ENABLED_SKILLS_DOMAIN_ID,
  PLANS_DOMAIN_ID,
  FILE_DIFFS_DOMAIN_ID,
];

/**
 * Browser-owned file-read transformers. `.textclip` (pasted text) and
 * `.swdomelement` (DOM-element captures) are blob types owned by the
 * browser host; the rendering is the generic structured-text payload
 * provided by `textBlobTransformer` in `@stagewise/agent-core`.
 */
const BROWSER_FILE_READ_TRANSFORMERS: Readonly<
  Record<string, FileTransformer>
> = {
  '.textclip': textBlobTransformer,
  '.swdomelement': textBlobTransformer,
};

/**
 * Mount-relative path for the project memo on this host. Reuses the
 * core default (`.stagewise/WORKSPACE.md`) so existing workspaces keep
 * working unchanged.
 */
const BROWSER_WORKSPACE_MD_RELATIVE_PATH = DEFAULT_WORKSPACE_MD_RELATIVE_PATH;

/**
 * Markdown link protocols the browser host's renderer understands
 * (`apps/browser/src/ui/components/streamdown/attachment-links.tsx`).
 * Appended to the agent-core baseline (`color`, `path`) in the chat
 * agent's system prompt.
 */
const BROWSER_OUTPUT_PROTOCOLS: readonly OutputProtocol[] = [
  {
    name: 'tab',
    syntax: '[](tab:{id})',
    rule: 'Every reference to a specific browser tab. Use the id from the `<tab>` block in the env-snapshot.',
  },
  {
    name: 'shell',
    syntax: '[](shell:{sessionId})',
    rule: 'Every reference to a specific shell session. Use the `session_id` from `<shell-sessions>` or a prior `executeShellCommand` result.',
  },
];
