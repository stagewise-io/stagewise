import * as os from 'node:os';
import * as path from 'node:path';
import type { LspServerInfo, LspServerHandle } from '../types';
import { RUST_EXTENSIONS } from '../language-map';
import { hasFileInTree, fileExists } from './utils/root-finder';
import {
  findExecutableOnPath,
  findInDirs,
  runCommandForPath,
} from './utils/binary-finder';
import { spawnStdioLspServer } from './utils/spawn-helpers';

/**
 * rust-analyzer Language Server definition (Rust).
 *
 * Relies on a user-installed `rust-analyzer` binary. Resolution order:
 *   1. PATH lookup.
 *   2. `rustup which rust-analyzer` (respects the active toolchain).
 *   3. The cargo bin directory (derived from the resolved env, not just the
 *      Electron process home).
 * Skips gracefully (returns undefined) when no binary can be found.
 *
 * Activates when a `Cargo.toml` exists anywhere in a bounded slice of the
 * project tree, so monorepos with `crates/foo/Cargo.toml` but no top-level
 * manifest still get Rust support.
 */
export const rustAnalyzerServer: LspServerInfo = {
  id: 'rust-analyzer',
  name: 'rust-analyzer',
  extensions: RUST_EXTENSIONS,

  // rust-analyzer's diagnostics come from `cargo check` (flycheck), which can
  // take several seconds on a cold target cache. The default 3s cap would time
  // out before the first publish and surface an empty result, so give it a
  // generous safety-net window; the wait still resolves the instant the publish
  // arrives.
  diagnosticsTimeoutMs: 15_000,

  // rust-analyzer advertises pull diagnostics (`diagnosticProvider`) but its
  // pull endpoint only returns syntax diagnostics and always omits the
  // `cargo check` (flycheck) results, which arrive exclusively via push. Using
  // the pull path would resolve the diagnostics wait with an empty report
  // before the real push lands, so force the push-only model.
  pushDiagnosticsOnly: true,

  async shouldActivate(projectRoot: string): Promise<boolean> {
    return hasFileInTree(projectRoot, ['Cargo.toml']);
  },

  async spawn(
    projectRoot: string,
    resolvedEnv?: Record<string, string> | null,
  ): Promise<LspServerHandle | undefined> {
    const env = resolvedEnv ?? globalThis.process.env;

    const binary = await resolveRustAnalyzer(env);
    if (!binary) {
      console.warn(
        '[rust-analyzer] Binary not found. Rust LSP support disabled. Install it via `rustup component add rust-analyzer` and ensure it is on PATH.',
      );
      return undefined;
    }

    // rust-analyzer communicates over stdio by default (no flag required).
    return spawnStdioLspServer(binary, [], { cwd: projectRoot, env });
  },
};

/**
 * Candidate cargo bin directories, honoring the resolved shell environment.
 * Order: CARGO_HOME/bin, then ~/.cargo/bin for the resolved HOME/USERPROFILE,
 * then the Electron process home as a last resort.
 */
function cargoBinDirs(
  env: Record<string, string> | NodeJS.ProcessEnv,
): string[] {
  const dirs: string[] = [];
  const cargoHome = env.CARGO_HOME;
  if (cargoHome) dirs.push(path.join(cargoHome, 'bin'));

  const home = env.HOME || env.USERPROFILE;
  if (home) dirs.push(path.join(home, '.cargo', 'bin'));

  dirs.push(path.join(os.homedir(), '.cargo', 'bin'));

  // De-duplicate while preserving order.
  return [...new Set(dirs)];
}

async function resolveRustAnalyzer(
  env: Record<string, string> | NodeJS.ProcessEnv,
): Promise<string | undefined> {
  // 1. Direct PATH lookup.
  const onPath = await findExecutableOnPath('rust-analyzer', env);
  if (onPath) return onPath;

  // 2. Ask rustup for the toolchain-managed binary.
  const rustup = await findExecutableOnPath('rustup', env);
  if (rustup) {
    const viaRustup = await runCommandForPath(
      rustup,
      ['which', 'rust-analyzer'],
      env,
    );
    if (viaRustup && (await fileExists(viaRustup))) return viaRustup;
  }

  // 3. Conventional cargo bin locations (resolved-env aware).
  return findInDirs('rust-analyzer', cargoBinDirs(env), env);
}
