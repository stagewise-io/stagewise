/**
 * `logIngest` host {@link DomainAdapter}.
 *
 * Tracks the local log-ingest HTTP server endpoint. The full-state
 * render is `<log-ingest port="..." token="..." />` (or empty when
 * the server is not running). The delta render emits
 * `log-ingest-started`/`-stopped`/`-restarted` events.
 */
import type { DomainAdapter } from '@stagewise/agent-core/env';
import {
  type EnvironmentChangeEntry,
  escAttr,
  renderChangesXml,
} from '@stagewise/agent-core/env';
import type { LogIngestSnapshot } from '@shared/env-domain-schemas';
import LogIngestDomainPromptSection from './log-ingest-domain-adapter.prompt.md?raw';

export const LOG_INGEST_DOMAIN_SCHEMA_VERSION = 1;

export type LogIngestDomainState = LogIngestSnapshot;

export interface LogIngestDomainAdapterDeps {
  /** Returns the live log-ingest endpoint descriptor, or `null`. */
  getSnapshot: () => LogIngestSnapshot;
}

function renderFullLogIngest(state: LogIngestDomainState): string {
  if (!state) return '';
  return `<log-ingest port="${state.port}" token="${escAttr(state.token)}" />`;
}

function computeLogIngestChanges(
  prev: LogIngestDomainState,
  curr: LogIngestDomainState,
): EnvironmentChangeEntry[] {
  if (!prev && !curr) return [];
  if (!prev && curr) {
    return [
      {
        type: 'log-ingest-started',
        attributes: { port: String(curr.port), token: curr.token },
      },
    ];
  }
  if (prev && !curr) return [{ type: 'log-ingest-stopped' }];

  if (prev!.port !== curr!.port || prev!.token !== curr!.token) {
    return [
      {
        type: 'log-ingest-restarted',
        attributes: { port: String(curr!.port), token: curr!.token },
      },
    ];
  }
  return [];
}

export function createLogIngestDomainAdapter(
  deps: LogIngestDomainAdapterDeps,
): DomainAdapter<LogIngestDomainState> {
  return {
    domainId: 'logIngest',
    renderOrder: 8,
    schemaVersion: LOG_INGEST_DOMAIN_SCHEMA_VERSION,
    promptSection: LogIngestDomainPromptSection,
    getState() {
      return deps.getSnapshot();
    },
    renderState(prev, curr) {
      if (prev === null) return renderFullLogIngest(curr);
      return renderChangesXml(computeLogIngestChanges(prev, curr));
    },
  };
}
