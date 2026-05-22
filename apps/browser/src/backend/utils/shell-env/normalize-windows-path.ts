/**
 * Normalize the Windows `Path` / `PATH` variable in-place.
 *
 * Windows env vars are case-insensitive, but Node preserves whatever casing
 * the native env block has (usually mixed-case `Path`). MSYS2 / Git Bash
 * reads only uppercase `PATH`. This helper:
 *
 * 1. If only `Path` exists → promotes it to `PATH`.
 * 2. If both exist with different values → merges and deduplicates
 *    (case-insensitive, semicolon-delimited).
 * 3. Deletes the mixed-case `Path` key so downstream consumers see a single
 *    canonical `PATH`.
 */
export function normalizeWindowsPath(env: Record<string, string>): void {
  const hasPath = Object.hasOwn(env, 'Path');
  const hasPATH = Object.hasOwn(env, 'PATH');

  if (hasPath && !hasPATH) {
    env.PATH = env.Path;
  } else if (hasPath && hasPATH && env.Path !== env.PATH) {
    const seen = new Set<string>();
    env.PATH = `${env.PATH};${env.Path}`
      .split(';')
      .filter((p) => {
        const k = p.toLowerCase();
        if (!p || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .join(';');
  }
  delete env.Path;
}
