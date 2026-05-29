import type { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import type { LspService } from '../services/lsp';

type MountPrefix = string;

export type MountedClientRuntimes = Map<MountPrefix, ClientRuntimeNode>;
export type MountedLspServices = Map<MountPrefix, LspService>;

/**
 * Re-exports of generic tool-output and file-state helpers from
 * `@stagewise/agent-core/toolbox`. Kept here as a shim so the existing
 * relative imports inside `apps/browser/src/backend/services/toolbox`
 * continue to resolve while the migration progresses.
 */
export {
  capToolOutput,
  rethrowCappedToolOutputError,
  truncatePreview,
  formatTruncationMessage,
  captureFileState,
  cleanupTempFile,
  buildAgentFileEditContent,
} from '@stagewise/agent-core/toolbox';
export type {
  CapToolOutputOptions,
  CappedToolOutput,
  FileStateResult,
  AgentFileEditContent,
  AgentFileEditResult,
} from '@stagewise/agent-core/toolbox';

/**
 * Extracts a human-readable error message from an Eden Treaty error object.
 * Eden errors have the shape `{ status: number, value: { error: string, message: string } }`.
 * Falls back to JSON.stringify, then String().
 *
 * Host-only: Eden error shape is specific to the browser host's HTTP integrations.
 */
export function extractEdenErrorMessage(
  error: { status?: number; value?: unknown } | unknown,
): string {
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    const value = obj.value;
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      if (typeof v.message === 'string') {
        return v.message;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      // fall through
    }
  }
  return String(error);
}
