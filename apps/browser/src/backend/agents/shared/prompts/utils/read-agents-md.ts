import type { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { readAgentsMd as readAgentsMdCore } from '@stagewise/agent-core/mount-manager';

/**
 * `ClientRuntimeNode`-flavored adapter around the canonical
 * `readAgentsMd` implementation that lives in `@stagewise/agent-core`.
 * Existing callers still pass a `ClientRuntimeNode`; the shim resolves
 * its working directory and delegates to the core reader (which
 * enforces the 40 KB cap internally).
 */
export async function readAgentsMd(
  clientRuntime: ClientRuntimeNode,
): Promise<string | null> {
  const path = clientRuntime.fileSystem.getCurrentWorkingDirectory();
  return readAgentsMdCore(path);
}
