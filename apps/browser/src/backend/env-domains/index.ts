/**
 * Host-owned environment {@link DomainAdapter} implementations. Each
 * adapter owns one slice of the env-state pipeline outside the
 * `@stagewise/agent-core` package and is registered on the manager via
 * {@link AgentManager.registerEnvAdapter} at startup.
 */
import type { AgentStore } from '@stagewise/agent-core';
import type {
  LogIngestSnapshot,
  ShellSnapshot,
} from '@shared/env-domain-schemas';
import type { KartonService } from '../services/karton';
import type { AgentManagerService } from '../services/agent-manager/agent-manager';
import { createActiveAppDomainAdapter } from './active-app-domain-adapter';
import { createBrowserDomainAdapter } from './browser-domain-adapter';
import { createLogIngestDomainAdapter } from './log-ingest-domain-adapter';
import { createSandboxDomainAdapter } from './sandbox-domain-adapter';
import {
  createShellsDomainAdapter,
  type ShellInfoState,
} from './shells-domain-adapter';

export {
  createBrowserHostEnvironmentSources,
  type BrowserHostEnvironmentSourcesDeps,
} from './host-environment-sources';

export {
  ACTIVE_APP_DOMAIN_SCHEMA_VERSION,
  createActiveAppDomainAdapter,
  type ActiveAppDomainAdapterDeps,
  type ActiveAppDomainState,
} from './active-app-domain-adapter';
export {
  BROWSER_DOMAIN_SCHEMA_VERSION,
  createBrowserDomainAdapter,
  renderBrowserTabsXml,
  type BrowserDomainAdapterDeps,
} from './browser-domain-adapter';
export {
  LOG_INGEST_DOMAIN_SCHEMA_VERSION,
  createLogIngestDomainAdapter,
  type LogIngestDomainAdapterDeps,
  type LogIngestDomainState,
} from './log-ingest-domain-adapter';
export {
  SANDBOX_DOMAIN_SCHEMA_VERSION,
  createSandboxDomainAdapter,
  type SandboxDomainAdapterDeps,
  type SandboxDomainState,
} from './sandbox-domain-adapter';
export {
  SHELLS_DOMAIN_SCHEMA_VERSION,
  createShellsDomainAdapter,
  type ShellsDomainAdapterDeps,
  type ShellsDomainState,
  type ShellInfoState,
} from './shells-domain-adapter';

/**
 * Dependencies required to instantiate the five host {@link DomainAdapter}
 * implementations.
 */
export interface HostEnvDomainAdapterDeps {
  karton: KartonService;
  store: AgentStore;
  getShellSnapshot: (agentInstanceId: string) => ShellSnapshot;
  getShellInfo: () => ShellInfoState;
  getSandboxSessionId: (agentInstanceId: string) => string | null;
  getLogIngestSnapshot: () => LogIngestSnapshot;
  /**
   * Optional override for the browser session id — primarily used in
   * tests. Defaults to `getBrowserSessionId()` from
   * `window-layout/browser-session` when omitted.
   */
  getBrowserSessionId?: () => string;
}

/**
 * Register all five host-owned env-state adapters on the given
 * {@link AgentManagerService}. Safe to call multiple times: each
 * `registerEnvAdapter` invocation replaces the previous adapter for that
 * domain id. Must run once at boot, before the first turn fires.
 */
export function registerHostEnvDomainAdapters(
  agentManagerService: AgentManagerService,
  deps: HostEnvDomainAdapterDeps,
): void {
  agentManagerService.registerEnvAdapter(
    createBrowserDomainAdapter({
      karton: deps.karton,
      getBrowserSessionId: deps.getBrowserSessionId,
    }),
  );
  agentManagerService.registerEnvAdapter(
    createShellsDomainAdapter({
      getSnapshot: deps.getShellSnapshot,
      getShellInfo: deps.getShellInfo,
    }),
  );
  agentManagerService.registerEnvAdapter(
    createSandboxDomainAdapter({ getSessionId: deps.getSandboxSessionId }),
  );
  agentManagerService.registerEnvAdapter(
    createActiveAppDomainAdapter({ store: deps.store }),
  );
  agentManagerService.registerEnvAdapter(
    createLogIngestDomainAdapter({ getSnapshot: deps.getLogIngestSnapshot }),
  );
}
