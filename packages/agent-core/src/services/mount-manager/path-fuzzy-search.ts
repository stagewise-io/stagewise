import { hasMatch, score } from 'fzy.js';

export type PathFuzzyCandidate = {
  relativePath: string;
  isDirectory?: boolean;
};

export type PathFuzzyResult<T extends PathFuzzyCandidate> = T & {
  pathFuzzyScore: number;
};

function scoreFilePath(
  lowerQuery: string,
  relativePath: string,
): number | null {
  const lowerPath = relativePath.toLowerCase();
  if (!hasMatch(lowerQuery, lowerPath)) return null;
  return score(lowerQuery, lowerPath);
}

function scoreDirectoryPath(
  lowerQuery: string,
  relativePath: string,
): number | null {
  const querySegments = lowerQuery
    .split('/')
    .filter((segment) => segment.length);
  const lastQuerySegment = querySegments[querySegments.length - 1];
  if (lastQuerySegment === undefined) return null;

  const pathSegments = relativePath.toLowerCase().split('/');
  const directoryName = pathSegments[pathSegments.length - 1];
  if (directoryName === undefined) return null;
  if (!hasMatch(lastQuerySegment, directoryName)) return null;

  if (querySegments.length > 1) {
    const ancestors = pathSegments.slice(0, -1);
    let ancestorIndex = 0;

    for (const querySegment of querySegments.slice(0, -1)) {
      let found = false;
      while (ancestorIndex < ancestors.length) {
        const ancestor = ancestors[ancestorIndex++];
        if (ancestor !== undefined && hasMatch(querySegment, ancestor)) {
          found = true;
          break;
        }
      }
      if (!found) return null;
    }
  }

  return score(lastQuerySegment, directoryName);
}

export function rankPathFuzzyCandidates<T extends PathFuzzyCandidate>(
  query: string,
  candidates: readonly T[],
): PathFuzzyResult<T>[] {
  const lowerQuery = query.toLowerCase();
  if (!lowerQuery || candidates.length === 0) return [];

  return candidates
    .map((candidate, index) => {
      const pathFuzzyScore = candidate.isDirectory
        ? scoreDirectoryPath(lowerQuery, candidate.relativePath)
        : scoreFilePath(lowerQuery, candidate.relativePath);

      return pathFuzzyScore === null
        ? null
        : { candidate, index, pathFuzzyScore };
    })
    .filter((result) => result !== null)
    .sort((a, b) => {
      if (b.pathFuzzyScore !== a.pathFuzzyScore) {
        return b.pathFuzzyScore - a.pathFuzzyScore;
      }
      return a.index - b.index;
    })
    .map(({ candidate, pathFuzzyScore }) => ({
      ...candidate,
      pathFuzzyScore,
    }));
}
