import { spawn } from 'node:child_process';
import type { LspServerHandle } from '../../types';

/**
 * Spawn a stdio-based LSP server and resolve a handle once it survives a short
 * handshake window.
 *
 * Shared by the native-binary servers (clangd, rust-analyzer) so the
 * spawn/handshake behavior stays consistent. Resolves `undefined` when:
 *   - the process fails to spawn (e.g. ENOENT), or
 *   - the process exits/crashes within the handshake window.
 *
 * The latter prevents a server that dies immediately (bad binary, missing
 * shared library, instant crash) from being reported as successfully started.
 * A crash *after* the window is still handled downstream by the LSP client's
 * initialize timeout.
 */
export function spawnStdioLspServer(
  binary: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string> | NodeJS.ProcessEnv;
    handshakeMs?: number;
  },
): Promise<LspServerHandle | undefined> {
  const { cwd, env, handshakeMs = 150 } = options;

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env,
    });
  } catch {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: LspServerHandle | undefined) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    child.on('error', () => finish(undefined));
    // Early exit within the handshake window means the server is unusable.
    child.on('exit', () => finish(undefined));

    setTimeout(() => {
      finish({ process: child as LspServerHandle['process'] });
    }, handshakeMs);
  });
}
