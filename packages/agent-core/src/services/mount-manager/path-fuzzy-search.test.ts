import { describe, expect, it } from 'vitest';
import { rankPathFuzzyCandidates } from './path-fuzzy-search';

const candidates = [
  { relativePath: 'agent-core/src/README.md' },
  { relativePath: 'apps/browser/src/index.ts' },
  { relativePath: 'packages/agent-core/src/services', isDirectory: true },
  {
    relativePath: 'packages/agent-core/src/services/mount-manager',
    isDirectory: true,
  },
];

describe('rankPathFuzzyCandidates', () => {
  it('matches queries across path segments', () => {
    const results = rankPathFuzzyCandidates('core/READ', candidates);

    expect(results.map((result) => result.relativePath)).toContain(
      'agent-core/src/README.md',
    );
  });

  it('matches basename-only queries', () => {
    const results = rankPathFuzzyCandidates('index', candidates);

    expect(results.map((result) => result.relativePath)).toContain(
      'apps/browser/src/index.ts',
    );
  });

  it('matches directories with ordered ancestor path segments', () => {
    const results = rankPathFuzzyCandidates('core/serv', candidates);

    expect(results.map((result) => result.relativePath)).toContain(
      'packages/agent-core/src/services',
    );
  });

  it('excludes non-matching paths', () => {
    const results = rankPathFuzzyCandidates('zzzz', candidates);

    expect(results).toEqual([]);
  });
});
