import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

/**
 * Hardcoded path-segment denylist enforced unconditionally by
 * `DiffHistoryService.shouldTrackFilepath` as a cheap synchronous
 * pre-check BEFORE any `.gitignore` is consulted. Contains only
 * exact path segments (no globs) so the matcher can be a trivial
 * `segments.some(s => HARDCODED_DENY_SEGMENTS.has(s))`.
 *
 * **Scope is intentionally tiny:** because this check runs before
 * `.gitignore`, any segment in here CANNOT be recovered via a user
 * `!` negation rule. The list must therefore contain only segments
 * that are **universally non-committed** — segments no real project
 * legitimately keeps under version control.
 *
 * Only three categories qualify:
 *   - `node_modules` — universally machine-generated; recreated by
 *     the package manager on any fresh clone.
 *   - `.git` — the VCS metadata directory; Git cannot function if
 *     this is tracked as content.
 *   - `.DS_Store` / `Thumbs.db` — OS filesystem junk that no one
 *     commits on purpose.
 *
 * **Deliberately excluded** (handled by the soft defaults in the
 * workspace ignore matcher below, overridable by the project's own
 * `.gitignore`):
 *   - Build output dirs (`dist`, `build`, `out`, `.output`, `.next`,
 *     `.nuxt`, `.svelte-kit`, `.astro`) — some projects commit
 *     generated code, prebuilt assets, or package `main` entry points.
 *   - Tooling caches (`.turbo`, `.cache`, `.parcel-cache`, `.vite`,
 *     `.angular`, `.gradle`) — usually ignored but not universally.
 *   - Test / coverage (`coverage`) — occasionally committed.
 *   - Editor / IDE / platform metadata (`.vscode`, `.idea`,
 *     `.vercel`) — commonly committed.
 *   - Lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`)
 *     — small, meaningful, commonly reviewed.
 */
export const HARDCODED_DENY_SEGMENTS: ReadonlySet<string> = new Set([
  // Package managers
  'node_modules',
  // VCS metadata
  '.git',
  // OS junk
  '.DS_Store',
  'Thumbs.db',
]);

/**
 * Soft defaults seeded into the shallowest layer of every workspace
 * ignore matcher.
 *
 * Pattern choice is deliberate on two axes:
 *
 * 1. **Unanchored prefix `**\/`**. A bare `dist/**` in the `ignore`
 *    package anchors to the matcher's root, so
 *    `packages/foo/dist/x.ts` would NOT match in a monorepo. The
 *    `**\/dist/**` form matches at any depth \u2014 what a user
 *    expects a soft default to do.
 *
 * 2. **File-level `/**` suffix** (rather than bare directory). Git's
 *    semantics say once a **directory** is ignored, files inside
 *    cannot be un-ignored \u2014 no later negation can recover them.
 *    The file-level form ignores the contents without ignoring the
 *    directory itself, so a project's `!dist/keep.ts` negation can
 *    still un-ignore individual files.
 *
 * Editor / IDE / platform metadata (`.vscode`, `.idea`, `.vercel`)
 * is deliberately NOT included \u2014 projects commonly commit those,
 * and adding a soft default would force users to write explicit
 * negations to recover them.
 */
const SOFT_DEFAULTS: readonly string[] = [
  // Common build / framework output.
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.output/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  // Tooling caches.
  '**/.turbo/**',
  '**/.cache/**',
  '**/.parcel-cache/**',
  '**/.vite/**',
  '**/.angular/**',
  '**/.gradle/**',
  // Test / coverage.
  '**/coverage/**',
  // Log files.
  '**/*.log',
];

/**
 * Single `.gitignore` layer, scoped to the directory containing it.
 * Patterns in `ig` are relative to `dir`, matching git's semantics
 * (a pattern `foo` in `/pkg/.gitignore` matches `/pkg/foo`, not
 * `/pkg/subpkg/foo-other`).
 */
interface GitignoreLayer {
  readonly dir: string;
  readonly ig: Ignore;
}

/**
 * Multi-layer matcher that honors `.gitignore` files at every level
 * from the workspace root down to each file's parent \u2014 matching
 * git's actual resolution semantics rather than the simpler
 * root-only approximation we had before.
 */
export interface WorkspaceIgnoreMatcher {
  readonly root: string;
  ignores(absoluteFilepath: string): boolean;
}

/**
 * Recursively collects every `.gitignore` file under `workspaceRoot`,
 * skipping directories whose basename is in `HARDCODED_DENY_SEGMENTS`
 * so we do not wander into `node_modules` or `.git`.
 *
 * Each returned entry holds the directory that contains the file
 * (which is what git uses as the pattern-anchor) plus the file's
 * raw contents.
 */
async function findGitignoreFiles(
  workspaceRoot: string,
): Promise<Array<{ dir: string; content: string }>> {
  const collected: Array<{ dir: string; content: string }> = [];
  const stack: string[] = [workspaceRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Directory became inaccessible mid-walk \u2014 skip and keep
      // discovering what we can. Never block an edit on this.
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (HARDCODED_DENY_SEGMENTS.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name === '.gitignore') {
        try {
          const content = await readFile(path.join(dir, entry.name), 'utf-8');
          collected.push({ dir, content });
        } catch {
          // Ignore read errors \u2014 treat as if the file didn't exist.
        }
      }
    }
  }
  return collected;
}

/**
 * Builds a `WorkspaceIgnoreMatcher` for the given workspace. The
 * matcher holds one `Ignore` instance per `.gitignore` file found
 * under the workspace, each scoped to the directory containing that
 * file. Evaluation walks layers shallow-to-deep and takes the
 * deepest layer that has a definitive opinion about the file \u2014
 * matching git's precedence semantics including negations.
 *
 * The shallowest layer (at `workspaceRoot`) additionally carries
 * the soft-default build-output / cache patterns so projects with
 * no `.gitignore` still get sensible behavior.
 */
export async function loadWorkspaceIgnore(
  workspaceRoot: string,
): Promise<WorkspaceIgnoreMatcher> {
  const files = await findGitignoreFiles(workspaceRoot);
  // Shallowest first so layer walking is just left-to-right.
  files.sort((a, b) => a.dir.length - b.dir.length);

  const layers: GitignoreLayer[] = [];
  // Ensure the shallowest layer exists and always carries soft
  // defaults. If the workspace had its own root `.gitignore` it
  // becomes this layer; otherwise we synthesize a defaults-only
  // layer at the workspace root.
  const hasRootLayer = files.length > 0 && files[0].dir === workspaceRoot;
  if (hasRootLayer) {
    const ig = ignore();
    // Soft defaults added FIRST so the user's `.gitignore` content
    // (including negations) added SECOND can override them.
    ig.add(SOFT_DEFAULTS);
    ig.add(files[0].content);
    layers.push({ dir: workspaceRoot, ig });
  } else {
    layers.push({ dir: workspaceRoot, ig: ignore().add(SOFT_DEFAULTS) });
  }

  // Deeper layers \u2014 each carries only its own `.gitignore`, no
  // soft defaults (the shallowest layer already covers those for
  // any descendant path).
  for (let i = hasRootLayer ? 1 : 0; i < files.length; i++) {
    const { dir, content } = files[i];
    const ig = ignore();
    ig.add(content);
    layers.push({ dir, ig });
  }

  return {
    root: workspaceRoot,
    ignores(absoluteFilepath: string): boolean {
      let verdict: boolean | null = null;
      for (const layer of layers) {
        // A layer applies to `absoluteFilepath` only if the file is
        // at or under the layer's directory. Path-boundary check
        // (exact equality OR `dir + path.sep` prefix) avoids false
        // positives from sibling names that share a prefix.
        const isExactMatch = absoluteFilepath === layer.dir;
        const isDescendant = absoluteFilepath.startsWith(
          layer.dir.endsWith(path.sep) ? layer.dir : layer.dir + path.sep,
        );
        if (!isExactMatch && !isDescendant) continue;
        const rel = path.relative(layer.dir, absoluteFilepath);
        // Out-of-tree escape or the directory itself \u2014 ignore has
        // nothing to test against.
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel))
          continue;
        // `ignore.test()` returns `{ignored, unignored}` so we can
        // distinguish "this layer explicitly matched" from "no rule
        // in this layer had anything to say." Only a definitive
        // match updates the verdict; layers that shrug keep the
        // prior answer.
        const res = layer.ig.test(rel);
        if (res.ignored) verdict = true;
        else if (res.unignored) verdict = false;
      }
      return verdict ?? false;
    },
  };
}
