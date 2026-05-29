import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Cross-platform native-executable discovery for LSP servers that are NOT
 * distributed via npm (e.g. clangd, rust-analyzer).
 *
 * All functions are defensive: they never throw and resolve to `undefined`
 * on any failure, so a missing binary degrades gracefully into a skipped
 * LSP server rather than a crash.
 */

const isWindows = process.platform === 'win32';

/**
 * Extensions that can be launched *directly* by `spawn(..., { shell: false })`
 * on Windows (PE images). `.cmd` / `.bat` are intentionally excluded: they are
 * batch shims that require `cmd.exe` to run, so returning them here would
 * succeed at lookup time but fail at process start. We honor PATHEXT but keep
 * only the directly-spawnable entries.
 */
function windowsDirectExtensions(
  env?: Record<string, string> | NodeJS.ProcessEnv,
): string[] {
  // Prefer the resolved shell env's PATHEXT (it is read alongside PATH); fall
  // back to the process env. A desktop-launched Electron session can have a
  // stale process.env while the resolved env carries the real PATHEXT.
  const resolved = env ?? process.env;
  const rawPathExt =
    (resolved as Record<string, string | undefined>).PATHEXT ??
    (resolved as Record<string, string | undefined>).Pathext ??
    process.env.PATHEXT ??
    '';
  const fromEnv = rawPathExt
    .split(';')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e === '.exe' || e === '.com');
  return fromEnv.length > 0 ? fromEnv : ['.exe', '.com'];
}

/**
 * Candidate file names to try for a given logical binary name.
 *
 * On Windows, `child_process.spawn` does not append executable extensions
 * for absolute paths, so we probe the directly-spawnable ones explicitly.
 */
function executableCandidates(
  binary: string,
  env?: Record<string, string> | NodeJS.ProcessEnv,
): string[] {
  if (!isWindows) return [binary];
  // If an extension is already present, trust it as-is.
  if (path.extname(binary)) return [binary];
  return [
    ...windowsDirectExtensions(env).map((ext) => `${binary}${ext}`),
    binary,
  ];
}

/**
 * Check that a resolved path is a regular file and (on non-Windows) is
 * executable. The file-type check prevents a directory that happens to match
 * the binary name from being returned as an executable.
 */
async function isUsableExecutable(candidate: string): Promise<boolean> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(candidate);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  if (isWindows) return true;
  try {
    await fs.promises.access(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the first usable executable for `binary` across the given
 * directories. Returns an absolute-ish path (joined from the dir) or
 * `undefined` if none match.
 */
export async function findInDirs(
  binary: string,
  dirs: string[],
  env?: Record<string, string> | NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const candidates = executableCandidates(binary, env);
  for (const dir of dirs) {
    if (!dir) continue;
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      if (await isUsableExecutable(full)) return full;
    }
  }
  return undefined;
}

/**
 * Resolve `binary` by scanning the PATH entries of the provided environment.
 *
 * Splits on `path.delimiter` (`;` on Windows, `:` elsewhere) and, on
 * Windows, also honors a lowercase `Path` key (Win32 env blocks vary in
 * casing). Returns the first usable match or `undefined`.
 */
export async function findExecutableOnPath(
  binary: string,
  env?: Record<string, string> | NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const resolvedEnv = env ?? process.env;
  const rawPath =
    resolvedEnv.PATH ??
    (resolvedEnv as Record<string, string | undefined>).Path ??
    (resolvedEnv as Record<string, string | undefined>).path ??
    '';

  const dirs = rawPath.split(path.delimiter).filter(Boolean);
  return findInDirs(binary, dirs, resolvedEnv);
}

/**
 * Spawn a command and return the trimmed first non-empty line of stdout.
 *
 * Used for toolchain proxies like `rustup which rust-analyzer`. Resolves
 * `undefined` on spawn error, non-zero exit, timeout, or empty output.
 */
export async function runCommandForPath(
  cmd: string,
  args: string[],
  env?: Record<string, string> | NodeJS.ProcessEnv,
  timeoutMs = 3000,
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    let settled = false;
    const done = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env ?? process.env,
      });
    } catch {
      done(undefined);
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      done(undefined);
    }, timeoutMs);

    const chunks: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', () => {
      clearTimeout(timer);
      done(undefined);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Only a clean exit-0 counts as success. A non-zero code, or a
      // signal-terminated process (code === null), must not yield a
      // "valid path" from whatever partial stdout was captured.
      if (signal !== null || code !== 0) {
        done(undefined);
        return;
      }
      const out = Buffer.concat(chunks).toString('utf-8');
      const firstLine = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      done(firstLine);
    });
  });
}
