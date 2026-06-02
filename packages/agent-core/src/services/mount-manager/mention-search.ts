import { hasMatch, score } from 'fzy.js';
import type { Logger } from '../../host/logger';
import type { MentionFileCandidate } from '../../types/metadata';

type MountPrefix = string;

/**
 * Minimal toolbox slice consumed by the mention-search initial
 * candidate lookup. Kept deliberately narrow so the core module
 * doesn't depend on the full Karton toolbox state shape.
 */
export interface MentionSearchToolboxState {
  pendingFileDiffs?: Array<{ path: string }>;
  editSummary?: Array<{ path: string }>;
}

/**
 * Host-side hooks the mention search needs. The host plugs in its
 * runtime registry + toolbox state readers; the core stays agnostic
 * of `ClientRuntimeNode` by typing it as a structural interface.
 */
export interface MentionSearchClientRuntime {
  fileSystem: {
    glob(
      pattern: string,
      options: { respectGitignore: boolean },
    ): Promise<{ success: boolean; relativePaths: string[] }>;
  };
}

export interface MentionSearchContext {
  getWorkspacePathForPrefix(prefix: string): string | undefined;
  getClientRuntimeForPrefix(
    prefix: string,
  ): MentionSearchClientRuntime | undefined;
  getToolboxState(
    agentInstanceId: string,
  ): MentionSearchToolboxState | undefined;
  getMountPrefixes(agentInstanceId: string): MountPrefix[] | undefined;
}

const MAX_SEARCH_RESULTS_PER_MOUNT = 50;
const MAX_FOLDER_RESULTS_PER_MOUNT = 10;

export class MentionSearchService {
  private readonly logger: Logger;
  private readonly ctx: MentionSearchContext;

  constructor(logger: Logger, ctx: MentionSearchContext) {
    this.logger = logger;
    this.ctx = ctx;
  }

  public async search(
    agentInstanceId: string,
    query: string,
  ): Promise<MentionFileCandidate[]> {
    const prefixes = this.ctx.getMountPrefixes(agentInstanceId);
    if (!prefixes || prefixes.length === 0) return [];

    if (!query) {
      return this.getInitialCandidates(agentInstanceId, prefixes);
    }

    return this.searchAcrossMounts(prefixes, query);
  }

  private getInitialCandidates(
    agentInstanceId: string,
    prefixes: MountPrefix[],
  ): MentionFileCandidate[] {
    const candidates: MentionFileCandidate[] = [];
    const seen = new Set<string>();

    const addCandidate = (c: MentionFileCandidate) => {
      if (seen.has(c.mountedPath)) return;
      seen.add(c.mountedPath);
      candidates.push(c);
    };

    const prefixSet = new Set(prefixes);
    const toolbox = this.ctx.getToolboxState(agentInstanceId);

    if (toolbox?.pendingFileDiffs) {
      for (const diff of toolbox.pendingFileDiffs) {
        const resolved = this.resolvePathToCandidate(
          diff.path,
          prefixSet,
          'pending-diff',
        );
        if (resolved) addCandidate(resolved);
      }
    }

    if (toolbox?.editSummary) {
      for (const diff of toolbox.editSummary) {
        const resolved = this.resolvePathToCandidate(
          diff.path,
          prefixSet,
          'edit-summary',
        );
        if (resolved) addCandidate(resolved);
      }
    }

    return candidates;
  }

  private async searchAcrossMounts(
    prefixes: MountPrefix[],
    query: string,
  ): Promise<MentionFileCandidate[]> {
    const searchPromises: Promise<MentionFileCandidate[]>[] = [];

    for (const prefix of prefixes) {
      const rt = this.ctx.getClientRuntimeForPrefix(prefix);
      if (!rt) continue;
      searchPromises.push(this.searchSingleMount(rt, prefix, query));
    }

    const results = await Promise.all(searchPromises);
    return results.flat();
  }

  private async searchSingleMount(
    clientRuntime: MentionSearchClientRuntime,
    mountPrefix: string,
    query: string,
  ): Promise<MentionFileCandidate[]> {
    try {
      const result = await clientRuntime.fileSystem.glob('**', {
        respectGitignore: true,
      });

      if (!result.success || result.relativePaths.length === 0) return [];

      const lowerQuery = query.toLowerCase();

      const scoredFiles: Array<{
        path: string;
        score: number;
        isDirectory?: boolean;
      }> = [];
      const dirs = new Set<string>();

      for (const relPath of result.relativePaths) {
        if (hasMatch(lowerQuery, relPath.toLowerCase())) {
          scoredFiles.push({
            path: relPath,
            score: score(lowerQuery, relPath.toLowerCase()),
          });
        }

        let dir = relPath;
        let slashIdx = dir.lastIndexOf('/');
        while (slashIdx > 0) {
          dir = dir.substring(0, slashIdx);
          if (dirs.has(dir)) break;
          dirs.add(dir);
          slashIdx = dir.lastIndexOf('/');
        }
      }

      const scoredDirs: Array<{
        path: string;
        score: number;
        isDirectory: true;
      }> = [];

      const querySegs = lowerQuery.split('/').filter((s) => s.length > 0);
      const lastQuerySeg = querySegs[querySegs.length - 1];
      const prefixQuerySegs = querySegs.slice(0, -1);

      if (lastQuerySeg !== undefined) {
        for (const dirPath of dirs) {
          const pathSegs = dirPath.toLowerCase().split('/');
          const dirName = pathSegs[pathSegs.length - 1];
          if (dirName === undefined) continue;

          if (!hasMatch(lastQuerySeg, dirName)) continue;
          const nameScore = score(lastQuerySeg, dirName);

          if (prefixQuerySegs.length > 0) {
            const ancestors = pathSegs.slice(0, -1);
            let ai = 0;
            let allMatch = true;
            for (const qSeg of prefixQuerySegs) {
              let found = false;
              while (ai < ancestors.length) {
                const ancestor = ancestors[ai++];
                if (ancestor !== undefined && hasMatch(qSeg, ancestor)) {
                  found = true;
                  break;
                }
              }
              if (!found) {
                allMatch = false;
                break;
              }
            }
            if (!allMatch) continue;
          }

          scoredDirs.push({
            path: dirPath,
            score: nameScore,
            isDirectory: true,
          });
        }
      }
      scoredDirs.sort((a, b) => b.score - a.score);

      scoredFiles.sort((a, b) => b.score - a.score);

      const topFiles = scoredFiles.slice(
        0,
        MAX_SEARCH_RESULTS_PER_MOUNT - MAX_FOLDER_RESULTS_PER_MOUNT,
      );
      const topDirs = scoredDirs.slice(0, MAX_FOLDER_RESULTS_PER_MOUNT);
      const merged = [...topFiles, ...topDirs];
      merged.sort((a, b) => b.score - a.score);

      return merged
        .slice(0, MAX_SEARCH_RESULTS_PER_MOUNT)
        .map(({ path: relPath, isDirectory }) => ({
          providerType: 'file' as const,
          mountedPath: `${mountPrefix}/${relPath}`,
          relativePath: relPath,
          mountPrefix,
          fileName: relPath.split('/').pop() ?? relPath,
          relevanceReason: 'search-match' as const,
          isDirectory: isDirectory || undefined,
        }));
    } catch (err) {
      this.logger.debug('[MentionSearch] searchMentionFiles error for mount', {
        prefix: mountPrefix,
        error: err,
      });
      return [];
    }
  }

  /**
   * Convert a file path (which may be mount-prefixed or absolute) to a
   * MentionFileCandidate by finding which mount it belongs to.
   */
  private resolvePathToCandidate(
    filePath: string,
    prefixes: Set<MountPrefix>,
    reason: MentionFileCandidate['relevanceReason'],
  ): MentionFileCandidate | null {
    const slashIdx = filePath.indexOf('/');
    if (slashIdx === -1) return null;

    const possiblePrefix = filePath.substring(0, slashIdx);
    if (prefixes.has(possiblePrefix)) {
      const relativePath = filePath.substring(slashIdx + 1);
      const fileName = relativePath.split('/').pop() ?? relativePath;
      return {
        providerType: 'file',
        mountedPath: filePath,
        relativePath,
        mountPrefix: possiblePrefix,
        fileName,
        relevanceReason: reason,
      };
    }

    for (const prefix of prefixes) {
      const wsPath = this.ctx.getWorkspacePathForPrefix(prefix);
      if (wsPath && filePath.startsWith(wsPath)) {
        const relativePath = filePath.substring(wsPath.length + 1);
        const fileName = relativePath.split('/').pop() ?? relativePath;
        return {
          providerType: 'file',
          mountedPath: `${prefix}/${relativePath}`,
          relativePath,
          mountPrefix: prefix,
          fileName,
          relevanceReason: reason,
        };
      }
    }

    return null;
  }
}
