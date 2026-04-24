import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pickOwningWorkspace } from '.';

// All tests use forward-slash paths joined via `path.join` so the
// assertions are portable across platforms \u2014 `path.sep` is injected
// implicitly into the candidate / input strings.
const p = (...parts: string[]) => path.join(path.sep, ...parts);

describe('pickOwningWorkspace', () => {
  it('returns undefined when there are no candidates', () => {
    expect(pickOwningWorkspace(p('Users', 'alice', 'foo.ts'), [])).toBe(
      undefined,
    );
  });

  it('returns undefined when no candidate contains the path', () => {
    expect(
      pickOwningWorkspace(p('Users', 'alice', 'bar', 'foo.ts'), [
        p('Users', 'alice', 'baz'),
      ]),
    ).toBe(undefined);
  });

  it('returns the candidate when the path equals it exactly', () => {
    const wsPath = p('Users', 'alice', 'repo');
    expect(pickOwningWorkspace(wsPath, [wsPath])).toBe(wsPath);
  });

  it('returns the candidate when the path is a descendant', () => {
    const wsPath = p('Users', 'alice', 'repo');
    const filePath = p('Users', 'alice', 'repo', 'src', 'app.ts');
    expect(pickOwningWorkspace(filePath, [wsPath])).toBe(wsPath);
  });

  it('does NOT match a sibling whose name shares the candidate prefix', () => {
    // This is the bug the fix guards against: `/Users/alice/foo` must
    // not match `/Users/alice/foo-other/app.ts` via naive `startsWith`.
    const wsPath = p('Users', 'alice', 'foo');
    const filePath = p('Users', 'alice', 'foo-other', 'app.ts');
    expect(pickOwningWorkspace(filePath, [wsPath])).toBe(undefined);
  });

  it('picks the innermost mount when nested mounts both match', () => {
    // Monorepo scenario: both the repo root and one of its packages
    // are mounted as separate workspaces. A file inside the package
    // must resolve to the package workspace so the package's own
    // `.gitignore` / LSP is consulted.
    const outer = p('Users', 'alice', 'monorepo');
    const inner = p('Users', 'alice', 'monorepo', 'packages', 'app');
    const filePath = p(
      'Users',
      'alice',
      'monorepo',
      'packages',
      'app',
      'src',
      'index.ts',
    );
    expect(pickOwningWorkspace(filePath, [outer, inner])).toBe(inner);
    // Iteration order must not matter \u2014 longest wins regardless.
    expect(pickOwningWorkspace(filePath, [inner, outer])).toBe(inner);
  });

  it('picks the outer mount when only it matches (file outside inner)', () => {
    const outer = p('Users', 'alice', 'monorepo');
    const inner = p('Users', 'alice', 'monorepo', 'packages', 'app');
    const filePath = p(
      'Users',
      'alice',
      'monorepo',
      'packages',
      'other',
      'src',
      'index.ts',
    );
    expect(pickOwningWorkspace(filePath, [outer, inner])).toBe(outer);
  });

  it('matches descendants of a filesystem-root mount', () => {
    // Regression guard: a root mount already ends with `path.sep`,
    // so the naïve `root + path.sep` form yields `//` (POSIX) or
    // `C:\\` (Windows) which no real path starts with. The helper
    // must detect the existing trailing separator and reuse it.
    const root = path.sep;
    const filePath = path.join(path.sep, 'Users', 'alice', 'foo.ts');
    expect(pickOwningWorkspace(filePath, [root])).toBe(root);
  });

  it('matches the exact root path against itself', () => {
    // Exact-equality branch must fire for a root candidate too,
    // independent of the descendant check.
    const root = path.sep;
    expect(pickOwningWorkspace(root, [root])).toBe(root);
  });
});
