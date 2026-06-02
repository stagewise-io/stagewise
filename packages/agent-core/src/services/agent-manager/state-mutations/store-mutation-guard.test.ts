import { promises as fs } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: every direct `store.update(...)` call against an
 * `AgentStore` MUST live in one of the files on the allowlist below.
 *
 * The allowlist is the canonical list of agent-state writers — adding
 * a new `store.update(...)` outside one of these files is a code-
 * review trip wire intended to push new mutations through the shared
 * `state-mutations/` utilities (or, for a host that legitimately owns
 * a different slice, through an explicit, documented controller).
 *
 * Updating the allowlist requires a justification in the corresponding
 * PR: why the new file is a legitimate writer (e.g. a new toolbox
 * slice it owns end-to-end, or a bridge that mirrors store state out
 * to another transport).
 *
 * Files matching `*.test.ts` are exempt because tests routinely seed
 * the store directly via Immer recipes; the guardrail targets
 * production code only.
 */
const ALLOWLIST = new Set([
  // Core agent-manager state-mutation utilities — every agent-
  // instance write flows through these.
  'packages/agent-core/src/services/agent-manager/state-mutations/internal.ts',
  'packages/agent-core/src/services/agent-manager/state-mutations/instances.ts',
  // Diff-history service: owns the `toolbox.pendingFileDiffs` /
  // `toolbox.editSummary` slice end-to-end. Writes one
  // `store.update()` per intent to match the D18 guarantee the bridge
  // mirror relies on.
  'packages/agent-core/src/services/diff-history/index.ts',
  // Core mount-manager state writer — owns `toolbox.workspace.mounts`
  // for the `MountManager` registry; the one-`store.update`-per-intent
  // discipline keeps the bridge mirror's reference-identity diff
  // correct.
  'packages/agent-core/src/services/mount-manager/mount-state.ts',
  // Browser-only toolbox slice controller for `activeApp` /
  // `pendingAppMessage`. Writes through the same
  // one-`store.update`-per-intent discipline.
  'apps/browser/src/backend/services/agent-core-bridge/state/toolbox-active-app.ts',
]);

const SCAN_ROOTS = ['packages/agent-core/src', 'apps/browser/src/backend'];

/**
 * Matches both `store.update(` and `this.store.update(` (with optional
 * whitespace). The pattern is intentionally narrow — wider matches
 * (e.g. arbitrary `.update(`) would flag unrelated APIs like
 * `Map.prototype.set` chains, Karton `setState` builders, or our own
 * `processedImageCache.update()`.
 */
const CALL_SITE_PATTERN = /\b(?:this\s*\.\s*)?store\s*\.\s*update\s*\(/;

/**
 * Strip line comments, block comments, and template/quoted strings so
 * `store.update()` mentions in docs (or sample code embedded in
 * comments / JSDoc) do not trip the guardrail. Plain heuristics are
 * fine because TS is not embedded in unusual delimiters and the
 * grammar of comments/strings is consistent.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') i += 2;
        else i++;
      }
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

async function walk(dir: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...(await walk(full)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

function toRepoPath(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join(posix.sep);
}

describe('store-mutation guardrail', () => {
  it('every store.update() call lives in the allowlist', async () => {
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      const files = await walk(join(REPO_ROOT, root));
      for (const file of files) {
        const repoPath = toRepoPath(file);
        if (ALLOWLIST.has(repoPath)) continue;
        const contents = await fs.readFile(file, 'utf8');
        const codeOnly = stripCommentsAndStrings(contents);
        if (CALL_SITE_PATTERN.test(codeOnly)) {
          offenders.push(repoPath);
        }
      }
    }

    expect(
      offenders,
      `Unexpected store.update() call sites found outside the allowlist.\n` +
        `If the new file is a legitimate agent-state writer, add it to ` +
        `ALLOWLIST in this test with a justification. Otherwise, route ` +
        `the write through the state-mutations utilities.`,
    ).toEqual([]);
  });
});
