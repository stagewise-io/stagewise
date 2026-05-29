import type { LanguageModel } from 'ai';
import type { ModelCapabilities } from '../types/models';
import { AgentHost, type AgentHostConfig } from './host';
import type { Logger } from './logger';
import type { HostModels, ModelWithOptions } from './models';
import type { HostPaths } from './paths';

/**
 * No-op logger that silently drops every call. Useful for tests that
 * exercise paths which emit debug/info logs without coupling
 * assertions to log output.
 */
const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Throwing path resolver. Test fixtures that exercise filesystem-
 * touching code paths must supply their own `HostPaths` overrides;
 * unhandled access fails loudly with a recognisable error so the
 * failing test points at the specific method that was missed.
 */
const throwingPaths: HostPaths = new Proxy({} as HostPaths, {
  get(_target, prop) {
    return () => {
      throw new Error(
        `[createTestAgentHost] HostPaths.${String(prop)}() not stubbed`,
      );
    };
  },
});

/**
 * Throwing model resolver. Tests that exercise model resolution must
 * supply their own `HostModels` override; unhandled access fails
 * loudly so the failing test points at the missing override.
 */
const throwingModels: HostModels = {
  getWithOptions(): Promise<ModelWithOptions> {
    throw new Error(
      '[createTestAgentHost] HostModels.getWithOptions() not stubbed',
    );
  },
  get(): Promise<LanguageModel> {
    throw new Error('[createTestAgentHost] HostModels.get() not stubbed');
  },
  has(): boolean {
    return false;
  },
  getCapabilities(): ModelCapabilities {
    throw new Error(
      '[createTestAgentHost] HostModels.getCapabilities() not stubbed',
    );
  },
};

/**
 * Build an {@link AgentHost} suitable for unit tests.
 *
 * The defaults are intentionally permissive (no-op logger, throwing
 * paths/models) so the host can be passed into any code path the test
 * exercises without ceremony. Tests that exercise a specific
 * capability supply an override via `partial`.
 *
 * Registrations (file-read transformers, tool-part serializers,
 * output protocols / aliases, system-prompt fragments) start empty.
 * Tests register what they need by calling the corresponding
 * `register*` / `set*` methods on the returned instance.
 */
export function createTestAgentHost(
  partial?: Partial<AgentHostConfig>,
): AgentHost {
  return new AgentHost({
    paths: partial?.paths ?? throwingPaths,
    models: partial?.models ?? throwingModels,
    logger: partial?.logger ?? noopLogger,
    telemetry: partial?.telemetry,
    desktop: partial?.desktop,
    environmentSources: partial?.environmentSources,
    readWorkspaceMdFromDisk: partial?.readWorkspaceMdFromDisk,
    workspaceMdRelativePath: partial?.workspaceMdRelativePath,
  });
}
