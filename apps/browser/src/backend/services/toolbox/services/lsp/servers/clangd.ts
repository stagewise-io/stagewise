import type { LspServerInfo, LspServerHandle } from '../types';
import { CLANGD_EXTENSIONS } from '../language-map';
import { hasFileInTree } from './utils/root-finder';
import { findExecutableOnPath } from './utils/binary-finder';
import { spawnStdioLspServer } from './utils/spawn-helpers';

/**
 * Markers that identify a C/C++ project clangd can meaningfully serve.
 *
 * Both clangd compilation databases are recognized: `compile_commands.json`
 * (full, tool-generated) and `compile_flags.txt` (the minimal one-flag-per-line
 * alternative clangd reads directly). Includes common Makefile casings
 * (GNU/lowercase). Source-only projects are intentionally NOT activated:
 * clangd without any build info gives poor results, and activating on bare
 * `.c`/`.cpp` files was a rejected design option.
 */
const CLANGD_MARKERS = [
  'compile_commands.json',
  'compile_flags.txt',
  '.clangd',
  'CMakeLists.txt',
  'Makefile',
  'makefile',
  'GNUmakefile',
];

/**
 * clangd Language Server definition (C / C++).
 *
 * Relies on a user-installed `clangd` binary discovered on the resolved
 * shell PATH. Skips gracefully (returns undefined) when the binary is
 * absent. Activates when a recognizable C/C++ marker exists anywhere in a
 * bounded slice of the project tree (covers `build/compile_commands.json`
 * and nested CMake/Make setups), so we do not spawn clangd for unrelated
 * repositories.
 */
export const clangdServer: LspServerInfo = {
  id: 'clangd',
  name: 'clangd',
  extensions: CLANGD_EXTENSIONS,

  // clangd publishes diagnostics via push on didOpen/didChange. It is
  // push-native, so never route it through the pull path (which advances the
  // document to a no-op second version and can resolve the wait early).
  pushDiagnosticsOnly: true,

  async shouldActivate(projectRoot: string): Promise<boolean> {
    return hasFileInTree(projectRoot, CLANGD_MARKERS);
  },

  async spawn(
    projectRoot: string,
    resolvedEnv?: Record<string, string> | null,
  ): Promise<LspServerHandle | undefined> {
    const env = resolvedEnv ?? globalThis.process.env;

    const binary = await findExecutableOnPath('clangd', env);
    if (!binary) {
      console.warn(
        '[clangd] Binary not found on PATH. C/C++ LSP support disabled. Install clangd (e.g. LLVM release) and ensure it is on PATH.',
      );
      return undefined;
    }

    // clangd communicates over stdio by default (no flag required).
    return spawnStdioLspServer(binary, ['--background-index', '--clang-tidy'], {
      cwd: projectRoot,
      env,
    });
  },
};
