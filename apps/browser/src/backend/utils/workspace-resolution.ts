import path from 'node:path';

/**
 * Picks the workspace that owns `filePath` from a set of candidate
 * workspace root paths.
 *
 * Two correctness properties to know about:
 *
 * 1. **Path-boundary match.** A bare `startsWith` would return true
 *    for sibling paths whose name happens to prefix a candidate
 *    (e.g. `/foo` vs `/foo-other/app.ts`). We require either exact
 *    equality or a `path.sep` boundary after the candidate.
 *
 * 2. **Longest-prefix wins.** With nested mounts (e.g. a monorepo
 *    root and one of its packages, both mounted), a file inside the
 *    inner mount must resolve to the inner workspace \u2014 that is the
 *    one whose `.gitignore` and LSP services are relevant for the
 *    file. First-match iteration would otherwise return whichever
 *    mount happens to be iterated first.
 *
 * Edge case: filesystem-root mounts (`/` on POSIX, `C:\` on Windows)
 * already end with `path.sep`; appending another separator would
 * produce `//` or `C:\\` which no real path starts with. Handled by
 * reusing the existing trailing separator in that case.
 *
 * Assumes candidates are absolute paths. Mount roots stored by
 * `MountManagerService.handleMountWorkspace` are normalized via
 * `path.resolve(...)` so non-root candidates have any trailing
 * separator already stripped; root candidates (`/`, `C:\`) keep theirs.
 */
export function pickOwningWorkspace(
  filePath: string,
  candidates: Iterable<string>,
): string | undefined {
  let best: string | undefined;
  for (const wsPath of candidates) {
    const rootWithSep = wsPath.endsWith(path.sep) ? wsPath : wsPath + path.sep;
    const isExactMatch = filePath === wsPath;
    const isDescendant = filePath.startsWith(rootWithSep);
    if (!isExactMatch && !isDescendant) continue;
    if (!best || wsPath.length > best.length) best = wsPath;
  }
  return best;
}
