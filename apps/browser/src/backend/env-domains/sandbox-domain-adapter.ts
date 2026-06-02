/**
 * `sandboxSessionId` host {@link DomainAdapter}.
 *
 * Tracks the current sandbox-process session id bound to the agent.
 * The full-state render is `<sandbox session="..." />` (or empty
 * string when no session is bound). The delta render emits a
 * `sandbox-restarted` event when the id transitions between two
 * non-null values.
 */
import type { DomainAdapter } from '@stagewise/agent-core/env';
import {
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from '@stagewise/agent-core/env';
import type { SandboxSessionIdState } from '@shared/env-domain-schemas';
import SandboxDomainPromptSection from './sandbox-domain-adapter.prompt.md?raw';

export const SANDBOX_DOMAIN_SCHEMA_VERSION = 1;

export type SandboxDomainState = SandboxSessionIdState;

export interface SandboxDomainAdapterDeps {
  /** Returns the sandbox session id bound to this agent, or `null`. */
  getSessionId: (agentInstanceId: string) => string | null;
}

function renderFullSandbox(state: SandboxDomainState): string {
  if (!state) return '';
  return `<sandbox session="${escAttr(state)}" />`;
}

function computeSandboxChanges(
  prev: SandboxDomainState,
  curr: SandboxDomainState,
): EnvironmentChangeEntry[] {
  if (!prev || !curr) return [];
  if (prev === curr) return [];
  return [{ type: 'sandbox-restarted' }];
}

/** Stable env-domain id for the sandbox adapter. */
export const SANDBOX_DOMAIN_ID = 'sandboxSessionId';

export function createSandboxDomainAdapter(
  deps: SandboxDomainAdapterDeps,
): DomainAdapter<SandboxDomainState> {
  return {
    domainId: SANDBOX_DOMAIN_ID,
    renderOrder: 10,
    schemaVersion: SANDBOX_DOMAIN_SCHEMA_VERSION,
    promptSection: SandboxDomainPromptSection,
    getState(agentInstanceId) {
      return deps.getSessionId(agentInstanceId);
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullSandbox(curr);
      return renderChangesXml(computeSandboxChanges(prev, curr));
    },
    equals(a, b) {
      return a === b;
    },
  };
}
