import { shell } from 'electron';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import chokidar, { type FSWatcher } from 'chokidar';
import ignore, { type Ignore } from 'ignore';
import type { Logger } from '../logger';
import type { KartonService } from '../karton';
import type {
  FilePreviewKind,
  FilePreviewResult,
  FileStatResult,
  FileSearchResult,
  FileTreeEntry,
  FileTreeListDirectoryInput,
  FileTreeListDirectoryResult,
  FileTabMetadata,
  OpenFileTabOptions,
  FileTreeClipboardOperation,
  FileTreeOperationResult,
} from '@shared/karton-contracts/ui';
import { FILE_SAVE_CONFLICT_CODE } from '@shared/karton-contracts/ui';
import { inferMimeType } from '@shared/mime-utils';
import { normalizePath } from '@shared/path-utils';
import { getRipgrepPath } from '@stagewise/agent-runtime-node';
import { rankPathFuzzyCandidates } from '@stagewise/agent-core/mount-manager';
import { DisposableService } from '../disposable';
import { getRipgrepBasePath } from '@/utils/paths';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_CACHE_ENTRIES = 200;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const CONTENT_SEARCH_RESULT_LIMIT = 5000;
const CONTENT_SEARCH_CONCURRENCY = 8;
const MAX_RIPGREP_JSON_LINE_BYTES = 10 * 1024 * 1024;
const REVISION_DEBOUNCE_MS = 1000;

const HIDDEN_LISTING_NAMES = new Set(['.git']);

const WATCH_IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'tmp',
  '.next',
  '.turbo',
  '.vite',
  '.webpack',
  '.cache',
  'coverage',
  'storybook-static',
]);

const WATCH_IGNORED_FILE_PATTERNS = [/\.tsbuildinfo$/, /\.log$/];

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'mdx',
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'gitignore',
  'dockerignore',
  'sh',
  'bash',
  'zsh',
  'py',
  'go',
  'rs',
  'java',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'sql',
  'graphql',
  'gql',
]);

type WorkspaceMount = {
  prefix: string;
  path: string;
};

/**
 * Workspace-key prefixes that point at non-editable, agent-internal storage
 * (attachment blobs, bundled plugins, agent app scratch space). Files opened
 * from these mounts are surfaced read-only: the editor disables saving and
 * hides write affordances.
 */
const READONLY_WORKSPACE_PREFIXES = new Set(['att', 'plugins', 'apps']);

/**
 * Reconstruct a {@link WorkspaceMount} directly from a workspace key.
 *
 * A workspace key has the shape `${prefix}:${absolutePath}`, so the underlying
 * storage location is fully recoverable from the key alone. This lets file
 * persistence/editing work even when the originating workspace is no longer
 * mounted (after an unmount, an app restart, or deletion of the linked agent)
 * and lets attachment (`att/`) blobs be addressed without a live mount.
 */
function parseWorkspaceKey(workspaceKey: string): WorkspaceMount | null {
  const separatorIndex = workspaceKey.indexOf(':');
  if (separatorIndex <= 0) return null;
  const prefix = workspaceKey.slice(0, separatorIndex);
  const mountPath = workspaceKey.slice(separatorIndex + 1);
  if (!prefix || !mountPath) return null;
  return { prefix, path: mountPath };
}

/** True when the workspace key targets a read-only, agent-internal mount. */
function isReadOnlyWorkspaceKey(workspaceKey: string): boolean {
  const mount = parseWorkspaceKey(workspaceKey);
  return mount ? READONLY_WORKSPACE_PREFIXES.has(mount.prefix) : false;
}

/**
 * Resolves the absolute attachment-blob directory for a given agent. Injected
 * by the backend so the file-tree service can open `att/` blobs as tabs
 * without importing host-path utilities directly.
 */
export type AttachmentDirResolver = (agentId: string) => string | null;

type ResolvedWorkspace = {
  key: string;
  mount: WorkspaceMount;
  root: string;
  rootReal: string;
};

type ValidatedPath = ResolvedWorkspace & {
  relativePath: string;
  absolutePath: string;
  realPath: string;
};

type DirectoryCacheEntry = {
  revision: number;
  entries: FileTreeEntry[];
};

type ContentSearchResult = FileSearchResult & {
  isDirectory: false;
  mtimeMs: number;
  absolutePath: string;
  contentMatchCount: number;
  contentMatches: NonNullable<FileSearchResult['contentMatches']>;
};

type RipgrepContentMatch = {
  count: number;
  snippets: NonNullable<FileSearchResult['contentMatches']>;
};

type RipgrepJsonMatch = {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{ match: { text: string } }>;
  };
};

type RipgrepProcessResult = {
  matches: Map<string, RipgrepContentMatch>;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export type OpenFileTabHandler = (
  metadata: FileTabMetadata,
  agentInstanceId?: string | null,
  options?: OpenFileTabOptions,
) => Promise<string | null>;

export class FileTreeService extends DisposableService {
  private readonly directoryCache = new Map<string, DirectoryCacheEntry>();
  private readonly ignoreCache = new Map<string, Promise<Ignore>>();
  private readonly watchers = new Map<string, FSWatcher>();
  // Absolute directory paths currently watched (depth 0) per workspace key.
  private readonly watchedDirs = new Map<string, Set<string>>();
  private readonly pendingRevisionTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly pendingRevisionDirectories = new Map<string, Set<string>>();
  private watchedMountsSignature = '';
  private openFileTabHandler: OpenFileTabHandler | null = null;
  private attachmentDirResolver: AttachmentDirResolver | null = null;

  private constructor(
    private readonly logger: Logger,
    private readonly uiKarton: KartonService,
  ) {
    super();
  }

  static async create(
    logger: Logger,
    uiKarton: KartonService,
  ): Promise<FileTreeService> {
    const service = new FileTreeService(logger, uiKarton);
    service.syncWatchers();
    uiKarton.registerStateChangeCallback(service.handleStateChange);
    return service;
  }

  setOpenFileTabHandler(handler: OpenFileTabHandler): void {
    this.openFileTabHandler = handler;
  }

  setAttachmentDirResolver(resolver: AttachmentDirResolver): void {
    this.attachmentDirResolver = resolver;
  }

  getWorkspaceKey(mount: WorkspaceMount): string {
    return `${mount.prefix}:${normalizePath(mount.path)}`;
  }

  async listDirectory(
    input: FileTreeListDirectoryInput,
  ): Promise<FileTreeListDirectoryResult> {
    const limit = Math.max(
      1,
      Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    );
    const offset = this.parseCursor(input.cursor);
    const validated = await this.validatePath(
      input.workspaceKey,
      input.directoryPath,
    );

    const stat = await fs.stat(validated.absolutePath);
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const revision = this.getDirectoryRevision(
      validated.key,
      validated.relativePath,
    );
    const cacheKey = `${validated.key}:${validated.relativePath}:${revision}`;
    let cached = this.directoryCache.get(cacheKey);
    if (!cached) {
      cached = {
        revision,
        entries: await this.readDirectoryEntries(validated),
      };
      this.setCacheEntry(cacheKey, cached);
    }

    const entries = cached.entries.slice(offset, offset + limit);
    const nextOffset = offset + entries.length;
    return {
      workspaceKey: validated.key,
      directoryPath: validated.relativePath,
      entries,
      nextCursor:
        nextOffset < cached.entries.length ? String(nextOffset) : null,
      revision: cached.revision,
    };
  }

  async getFilePreview(
    workspaceKey: string,
    relativePath: string,
  ): Promise<FilePreviewResult | null> {
    const validated = await this.validatePath(workspaceKey, relativePath);
    const stat = await fs.stat(validated.absolutePath);
    if (!stat.isFile()) return null;

    const mimeType = inferMimeType(validated.relativePath);
    const kind = await this.classifyFile(validated.absolutePath, mimeType);
    const base: FilePreviewResult = {
      workspaceKey: validated.key,
      relativePath: validated.relativePath,
      kind,
      mimeType,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      readOnly: isReadOnlyWorkspaceKey(validated.key),
    };

    if (kind === 'text' || kind === 'svg') {
      const bytesToRead = Math.min(stat.size, MAX_TEXT_BYTES);
      const handle = await fs.open(validated.absolutePath, 'r');
      try {
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
        return {
          ...base,
          text: buffer.subarray(0, bytesRead).toString('utf8'),
          truncated: stat.size > MAX_TEXT_BYTES,
        };
      } finally {
        await handle.close();
      }
    }

    if (kind === 'image') return base;

    return base;
  }

  /**
   * Cheap revalidation primitive: returns the file's current mtime/size
   * without reading its contents, or null when it no longer exists. Used by
   * the UI to detect external edits before deciding whether to reload.
   */
  async getFileStat(
    workspaceKey: string,
    relativePath: string,
  ): Promise<FileStatResult | null> {
    try {
      const validated = await this.validatePath(workspaceKey, relativePath);
      const stat = await fs.stat(validated.absolutePath);
      if (!stat.isFile()) return null;
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
      // Missing file / unreadable path → treat as "no longer available".
      return null;
    }
  }

  async saveFile(
    workspaceKey: string,
    relativePath: string,
    text: string,
    expectedMtimeMs?: number | null,
  ): Promise<FilePreviewResult | null> {
    if (isReadOnlyWorkspaceKey(workspaceKey)) {
      throw new Error('This file is read-only and cannot be saved');
    }
    const validated = await this.validatePath(workspaceKey, relativePath);
    // Conflict guard: refuse to clobber an external modification unless the
    // caller explicitly forces the write (expectedMtimeMs omitted/null).
    if (expectedMtimeMs != null) {
      const current = await fs.stat(validated.absolutePath).catch(() => null);
      if (current && current.mtimeMs !== expectedMtimeMs) {
        throw new Error(FILE_SAVE_CONFLICT_CODE);
      }
    }
    await fs.writeFile(validated.absolutePath, text, 'utf8');
    this.invalidateDirectoryCacheForPath(validated.key, validated.absolutePath);
    return this.getFilePreview(workspaceKey, relativePath);
  }

  async openFileTab(
    workspaceKey: string,
    relativePath: string,
    agentInstanceId?: string | null,
    options?: OpenFileTabOptions,
  ): Promise<string | null> {
    if (!this.openFileTabHandler) return null;
    const preview = await this.getFilePreview(workspaceKey, relativePath);
    if (!preview) return null;
    const validated = await this.validatePath(workspaceKey, relativePath);
    return this.openFileTabHandler(
      {
        workspaceKey: validated.key,
        relativePath: validated.relativePath,
        absolutePath: validated.absolutePath,
        kind: preview.kind,
        mimeType: preview.mimeType,
        size: preview.size,
        readOnly: preview.readOnly,
        showDiff: options?.showDiff,
        diffStaged: options?.diffStaged,
        diffOldPath: options?.diffOldPath,
      },
      agentInstanceId,
      options,
    );
  }

  /**
   * Open an agent attachment blob (stored under the per-agent `att/`
   * directory) as a read-only file tab. Resolves the blob directory via the
   * injected {@link AttachmentDirResolver}, then reuses the regular file-tab
   * pipeline so the tab survives restarts and resolves through the
   * key-reconstruction fallback even when no workspace is mounted.
   */
  async openAttachmentTab(
    agentId: string,
    attachmentId: string,
    displayName?: string,
    agentInstanceId?: string | null,
    options?: OpenFileTabOptions,
  ): Promise<string | null> {
    if (!this.openFileTabHandler) return null;
    if (!this.attachmentDirResolver) {
      this.logger.warn(
        '[FileTree] Cannot open attachment tab: no attachment dir resolver',
      );
      return null;
    }
    const blobDir = this.attachmentDirResolver(agentId);
    if (!blobDir) return null;
    const workspaceKey = `att:${normalizePath(blobDir)}`;
    const preview = await this.getFilePreview(workspaceKey, attachmentId);
    if (!preview) return null;
    const validated = await this.validatePath(workspaceKey, attachmentId);
    const title = displayName?.trim() || undefined;
    return this.openFileTabHandler(
      {
        workspaceKey: validated.key,
        relativePath: validated.relativePath,
        absolutePath: validated.absolutePath,
        kind: preview.kind,
        mimeType: preview.mimeType,
        size: preview.size,
        displayName: title,
        readOnly: true,
      },
      agentInstanceId ?? null,
      options,
    );
  }

  async renameEntry(
    workspaceKey: string,
    relativePath: string,
    newName: string,
  ): Promise<FileTreeOperationResult> {
    if (isReadOnlyWorkspaceKey(workspaceKey)) {
      throw new Error('This file is read-only and cannot be renamed');
    }
    try {
      const source = await this.validatePath(workspaceKey, relativePath);
      const safeName = this.validateEntryName(newName);
      const parentPath = this.normalizeRelative(
        path.dirname(source.relativePath),
      );
      const targetRelativePath = parentPath
        ? `${parentPath}/${safeName}`
        : safeName;

      if (targetRelativePath === source.relativePath) {
        return { success: true, relativePath: source.relativePath };
      }

      const target = await this.resolveTargetPath(
        source.key,
        parentPath,
        safeName,
      );
      if (await this.pathExists(target.absolutePath)) {
        return {
          success: false,
          error: 'A file or folder with that name already exists.',
        };
      }

      await fs.rename(source.absolutePath, target.absolutePath);
      this.updateFileTabsAfterMove(
        source.key,
        source.relativePath,
        target.relativePath,
      );
      this.bumpDirectoryRevisionsNow(source.key, [parentPath]);
      return { success: true, relativePath: target.relativePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async pasteEntry(
    sourceWorkspaceKey: string,
    sourceRelativePath: string,
    targetWorkspaceKey: string,
    targetDirectoryPath: string,
    operation: FileTreeClipboardOperation,
    preferredName?: string,
  ): Promise<FileTreeOperationResult> {
    if (isReadOnlyWorkspaceKey(targetWorkspaceKey)) {
      throw new Error('This location is read-only and cannot be pasted into');
    }
    if (operation === 'cut' && isReadOnlyWorkspaceKey(sourceWorkspaceKey)) {
      throw new Error('This file is read-only and cannot be moved');
    }
    try {
      const source = await this.validatePath(
        sourceWorkspaceKey,
        sourceRelativePath,
      );
      const targetDirectory = await this.validatePath(
        targetWorkspaceKey,
        targetDirectoryPath,
      );
      const targetStat = await fs.stat(targetDirectory.absolutePath);
      if (!targetStat.isDirectory()) {
        return { success: false, error: 'Paste target is not a directory.' };
      }

      if (await this.isDirectory(source.absolutePath)) {
        const relativeFromSource = path.relative(
          source.realPath,
          targetDirectory.realPath,
        );
        if (
          relativeFromSource === '' ||
          (!relativeFromSource.startsWith('..') &&
            !path.isAbsolute(relativeFromSource))
        ) {
          return {
            success: false,
            error: 'Cannot paste a folder into itself.',
          };
        }
      }

      const sourceName = preferredName
        ? this.validateEntryName(preferredName)
        : path.basename(source.relativePath);
      const destinationName =
        operation === 'copy'
          ? await this.getAvailableCopyName(
              targetDirectory.absolutePath,
              sourceName,
            )
          : sourceName;
      const destinationPath = path.join(
        targetDirectory.absolutePath,
        destinationName,
      );
      const destinationRelativePath = targetDirectory.relativePath
        ? `${targetDirectory.relativePath}/${destinationName}`
        : destinationName;

      if (operation === 'cut') {
        if (path.dirname(source.realPath) === targetDirectory.realPath) {
          this.bumpDirectoryRevisionsNow(targetDirectory.key, [
            targetDirectory.relativePath,
          ]);
          return { success: true, relativePath: source.relativePath };
        }
        if (await this.pathExists(destinationPath)) {
          return {
            success: false,
            error: 'A file or folder with that name already exists.',
          };
        }
        await fs.rename(source.absolutePath, destinationPath);
        this.updateFileTabsAfterMove(
          source.key,
          source.relativePath,
          destinationRelativePath,
        );
        this.bumpDirectoryRevisionsNow(source.key, [
          this.normalizeRelative(path.dirname(source.relativePath)),
        ]);
      } else {
        await fs.cp(source.absolutePath, destinationPath, {
          recursive: true,
          errorOnExist: true,
          force: false,
          preserveTimestamps: true,
        });
      }

      this.bumpDirectoryRevisionsNow(targetDirectory.key, [
        targetDirectory.relativePath,
      ]);
      return { success: true, relativePath: destinationRelativePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async deleteEntry(
    workspaceKey: string,
    relativePath: string,
  ): Promise<FileTreeOperationResult> {
    if (isReadOnlyWorkspaceKey(workspaceKey)) {
      throw new Error('This file is read-only and cannot be deleted');
    }
    try {
      const validated = await this.validatePath(workspaceKey, relativePath);
      await fs.rm(validated.absolutePath, { recursive: true, force: false });
      this.closeFileTabsForPath(validated.key, validated.relativePath);
      const parentPath = this.normalizeRelative(
        path.dirname(validated.relativePath),
      );
      this.bumpDirectoryRevisionsNow(validated.key, [parentPath]);
      return { success: true, relativePath: parentPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async createFile(
    workspaceKey: string,
    directoryPath: string,
  ): Promise<FileTreeOperationResult> {
    if (isReadOnlyWorkspaceKey(workspaceKey)) {
      throw new Error('This location is read-only and cannot be created in');
    }
    try {
      const directory = await this.validatePath(workspaceKey, directoryPath);
      const dirStat = await fs.stat(directory.absolutePath);
      if (!dirStat.isDirectory()) {
        return { success: false, error: 'Target path is not a directory.' };
      }

      // Atomically create the file and reserve its name in a single step
      // using O_CREAT | O_EXCL, which fails with EEXIST if the path already
      // exists. This prevents concurrent createFile calls from racing on
      // the same default name.
      const { relativePath } = await this.createAvailableNewFile(
        directory.absolutePath,
        directory.relativePath,
      );

      this.bumpDirectoryRevisionsNow(directory.key, [directory.relativePath]);
      return { success: true, relativePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async recreateDeletedFile(
    workspaceKey: string,
    relativePath: string,
    content: string,
  ): Promise<FileTreeOperationResult> {
    if (isReadOnlyWorkspaceKey(workspaceKey)) {
      throw new Error('This file is read-only and cannot be recreated');
    }
    try {
      const mount = this.resolveWorkspace(workspaceKey);
      if (!mount) throw new Error('Workspace not mounted');
      const normalizedRelative = this.normalizeRelative(relativePath);
      if (path.isAbsolute(normalizedRelative)) {
        throw new Error('Absolute paths are not allowed');
      }

      const root = path.resolve(mount.path);
      const absolutePath = path.resolve(root, normalizedRelative || '.');
      const rootReal = await fs.realpath(root);

      // Resolve the parent directory via realpath so we can validate
      // the target path without requiring the file itself to exist.
      const parentDir = path.dirname(absolutePath);
      let realParent: string;
      try {
        realParent = await fs.realpath(parentDir);
      } catch {
        throw new Error('Parent directory does not exist');
      }

      const realPath = path.join(realParent, path.basename(absolutePath));
      const relativeFromRoot = path.relative(rootReal, realPath);
      if (
        relativeFromRoot === '..' ||
        relativeFromRoot.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeFromRoot)
      ) {
        throw new Error('Path escapes workspace root');
      }

      await fs.writeFile(realPath, content, 'utf-8');

      const mountKey = this.getWorkspaceKey(mount);
      // Clear the delete notice on any tabs tracking this file.
      this.uiKarton.setState((draft) => {
        for (const tab of Object.values(draft.contentTabs.tabs)) {
          if (
            tab.fileNotice?.kind === 'deleted' &&
            tab.file?.workspaceKey === mountKey &&
            tab.file.relativePath === normalizedRelative
          ) {
            tab.fileNotice = undefined;
          }
        }
      });
      const parentPath = this.normalizeRelative(
        path.dirname(normalizedRelative),
      );
      this.bumpDirectoryRevisionsNow(mountKey, [parentPath]);
      return { success: true, relativePath: normalizedRelative };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  revealInFileTree(workspaceKey: string, relativePath: string): void {
    const normalized = this.normalizeRelative(relativePath);
    const expandedPaths: string[] = [];
    let current = this.normalizeRelative(path.dirname(normalized));
    while (current && current !== '.') {
      expandedPaths.unshift(current);
      const parent = this.normalizeRelative(path.dirname(current));
      if (parent === current) break;
      current = parent;
    }

    this.uiKarton.setState((draft) => {
      draft.fileTree.visible = true;
      draft.fileTree.activeWorkspaceKey = workspaceKey;
      const existing = new Set(
        draft.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] ?? [],
      );
      for (const directoryPath of expandedPaths) {
        existing.add(directoryPath);
      }
      draft.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] =
        Array.from(existing);
    });
  }

  async revealInFolder(
    workspaceKey: string,
    relativePath: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validated = await this.validatePath(workspaceKey, relativePath);
      shell.showItemInFolder(validated.realPath);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  setVisible(visible: boolean): void {
    this.uiKarton.setState((draft) => {
      draft.fileTree.visible = visible;
    });
  }

  /**
   * Walk the selected workspaces collecting matching entries. `match` decides
   * whether an entry is collected; results carry `mtimeMs` for recency
   * sorting. Shared by file search and the "recently changed" listing.
   */
  private async collectWorkspaceEntries(
    workspaceKeys: string[],
    includeGitignored: boolean,
    options: {
      maxResults: number;
      maxDepth: number;
      includeDirectories: boolean;
      match: (name: string, isDir: boolean, relativePath: string) => boolean;
    },
  ): Promise<
    Array<FileSearchResult & { mtimeMs: number; absolutePath: string }>
  > {
    const { maxResults, maxDepth, includeDirectories, match } = options;
    const results: Array<
      FileSearchResult & { mtimeMs: number; absolutePath: string }
    > = [];
    const seen = new Set<string>();

    for (const workspaceKey of workspaceKeys) {
      if (results.length >= maxResults) break;
      const mount = this.resolveWorkspace(workspaceKey);
      if (!mount) continue;

      let ig: Ignore | null = null;
      if (!includeGitignored) {
        ig = await this.getIgnore({
          key: workspaceKey,
          mount,
          root: mount.path,
          rootReal: mount.path,
        });
      }

      const walkDir = async (dirRelativePath: string, depth: number) => {
        if (results.length >= maxResults || depth > maxDepth) return;
        const absoluteDir = dirRelativePath
          ? path.join(mount.path, dirRelativePath)
          : mount.path;

        let entries: Array<{
          name: string;
          isDir: boolean;
          isFile: boolean;
          mtimeMs: number;
        }>;
        try {
          const dirents = await fs.readdir(absoluteDir, {
            withFileTypes: true,
          });
          entries = await Promise.all(
            dirents.map(async (dirent) => {
              let isDir = dirent.isDirectory();
              let isFile = dirent.isFile();
              let mtimeMs = 0;
              try {
                const stat = await fs.stat(path.join(absoluteDir, dirent.name));
                isDir = stat.isDirectory();
                isFile = stat.isFile();
                mtimeMs = stat.mtimeMs;
              } catch {
                isDir = false;
                isFile = false;
              }
              return { name: dirent.name, isDir, isFile, mtimeMs };
            }),
          );
        } catch {
          return;
        }

        for (const { name, isDir, isFile, mtimeMs } of entries) {
          if (results.length >= maxResults) return;
          if (name === '.git' || name === 'node_modules') continue;
          if (!isDir && !isFile) continue;

          const relPath = dirRelativePath ? `${dirRelativePath}/${name}` : name;
          // The default-ignore set (dist, build, .next, coverage, …) overlaps
          // heavily with what git ignores, so only apply it when the caller
          // is NOT explicitly including gitignored files. `.git`/`node_modules`
          // stay excluded unconditionally (handled above) for sanity/perf.
          if (!includeGitignored && this.isDefaultIgnoredPath(relPath))
            continue;
          if (ig?.ignores(isDir ? `${relPath}/` : relPath)) continue;

          const collectible =
            (isFile || includeDirectories) && match(name, isDir, relPath);
          if (collectible) {
            const uniqueKey = `${workspaceKey}:${relPath}`;
            if (!seen.has(uniqueKey)) {
              seen.add(uniqueKey);
              results.push({
                workspaceKey,
                mountPrefix: mount.prefix,
                relativePath: relPath,
                fileName: name,
                isDirectory: isDir,
                mtimeMs,
                absolutePath: path.join(absoluteDir, name),
              });
            }
          }

          if (isDir) await walkDir(relPath, depth + 1);
        }
      };

      await walkDir('', 0);
    }

    return results;
  }

  async searchFiles(
    query: string,
    workspaceKeys: string[],
    includeGitignored: boolean,
    searchInContent = false,
  ): Promise<FileSearchResult[]> {
    const trimmedQuery = query.trim();
    const collected = await this.collectWorkspaceEntries(
      workspaceKeys,
      includeGitignored,
      {
        maxResults: 5000,
        maxDepth: 12,
        includeDirectories: true,
        match: () => true,
      },
    );
    const pathMatches = rankPathFuzzyCandidates(trimmedQuery, collected);

    const getPathScore = (
      result: FileSearchResult & { pathFuzzyScore?: number },
    ): number =>
      result.pathFuzzyScore ??
      rankPathFuzzyCandidates(trimmedQuery, [result])[0]?.pathFuzzyScore ??
      0;
    const hasExactPathMatch = (result: FileSearchResult): boolean => {
      const lowerQuery = trimmedQuery.toLowerCase();
      const lowerRelativePath = result.relativePath.toLowerCase();
      const lowerFileName = result.fileName.toLowerCase();
      return lowerRelativePath === lowerQuery || lowerFileName === lowerQuery;
    };

    if (!searchInContent) {
      return pathMatches
        .sort((a, b) => {
          if (b.pathFuzzyScore !== a.pathFuzzyScore) {
            return b.pathFuzzyScore - a.pathFuzzyScore;
          }
          return b.mtimeMs - a.mtimeMs;
        })
        .slice(0, 200)
        .map(
          ({
            absolutePath: _absolutePath,
            pathFuzzyScore: _score,
            ...result
          }) => result,
        );
    }

    const byKey = new Map<
      string,
      FileSearchResult & {
        mtimeMs: number;
        absolutePath: string;
        pathScore: number;
        pathFuzzyScore?: number;
        category: number;
        contentMatchCount: number;
      }
    >();

    const addOrUpdate = (
      result: FileSearchResult & {
        mtimeMs: number;
        absolutePath: string;
        contentMatchCount?: number;
      },
    ) => {
      const key = `${result.workspaceKey}:${result.relativePath}`;
      const pathScore = getPathScore(result);
      const contentMatchCount = result.contentMatchCount ?? 0;
      const exactPathMatch = hasExactPathMatch(result);
      const category = exactPathMatch ? 3 : contentMatchCount > 0 ? 2 : 1;
      const existing = byKey.get(key);
      byKey.set(key, {
        ...existing,
        ...result,
        pathScore,
        category,
        contentMatchCount,
        contentMatches:
          contentMatchCount > 0
            ? (result.contentMatches ?? existing?.contentMatches)
            : existing?.contentMatches,
      });
    };

    for (const result of pathMatches) addOrUpdate(result);
    for (const result of await this.searchContentWithRipgrep(
      query,
      workspaceKeys,
      includeGitignored,
    )) {
      addOrUpdate(result);
    }

    const searched = [...byKey.values()];

    return searched
      .filter(
        ({ pathScore, contentMatchCount }) =>
          pathScore > 0 || contentMatchCount > 0,
      )
      .sort((a, b) => {
        if (b.category !== a.category) return b.category - a.category;
        if (a.category === 2 && b.contentMatchCount !== a.contentMatchCount) {
          return b.contentMatchCount - a.contentMatchCount;
        }
        if (b.pathScore !== a.pathScore) return b.pathScore - a.pathScore;
        return b.mtimeMs - a.mtimeMs;
      })
      .slice(0, 200)
      .map(
        ({
          absolutePath: _absolutePath,
          pathScore: _pathScore,
          pathFuzzyScore: _pathFuzzyScore,
          category: _category,
          ...result
        }) => result,
      );
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const index = nextIndex;
          nextIndex += 1;
          results[index] = await mapper(items[index]!);
        }
      }),
    );

    return results;
  }

  private async searchContentWithRipgrep(
    query: string,
    workspaceKeys: string[],
    includeGitignored: boolean,
  ): Promise<ContentSearchResult[]> {
    const rgPath = getRipgrepPath(getRipgrepBasePath());
    if (!existsSync(rgPath)) return [];

    const results: ContentSearchResult[] = [];

    for (const workspaceKey of workspaceKeys) {
      const mount = this.resolveWorkspace(workspaceKey);
      if (!mount) continue;

      const matches = await this.findContentMatchesWithRipgrep(
        rgPath,
        mount.path,
        query,
        includeGitignored,
      );
      if (matches.size === 0) continue;

      const entries = [...matches.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, CONTENT_SEARCH_RESULT_LIMIT);

      const workspaceResults = await this.mapWithConcurrency(
        entries,
        CONTENT_SEARCH_CONCURRENCY,
        async ([relativePath, match]) => {
          const absolutePath = path.join(mount.path, relativePath);
          try {
            const stat = await fs.stat(absolutePath);
            if (!stat.isFile()) return null;
            return {
              workspaceKey,
              mountPrefix: mount.prefix,
              relativePath,
              fileName: path.basename(relativePath),
              isDirectory: false,
              mtimeMs: stat.mtimeMs,
              absolutePath,
              contentMatchCount: match.count,
              contentMatches: match.snippets,
            };
          } catch {
            return null;
          }
        },
      );

      results.push(
        ...workspaceResults.filter(
          (result): result is ContentSearchResult => result !== null,
        ),
      );
    }

    return results;
  }

  private async findContentMatchesWithRipgrep(
    rgPath: string,
    workspacePath: string,
    query: string,
    includeGitignored: boolean,
  ): Promise<Map<string, RipgrepContentMatch>> {
    const args = this.buildContentSearchRipgrepArgs(query, includeGitignored);
    const child = spawn(rgPath, args, {
      cwd: workspacePath,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    if (!child.stdout) return new Map();

    try {
      const { matches, exitCode, signal } = await this.readRipgrepMatches(
        child,
        query,
        includeGitignored,
      );

      // ripgrep returns 1 for a successful search with zero matches.
      if (exitCode !== 0 && exitCode !== 1) {
        this.logger.debug('[FileTreeService] ripgrep content search failed', {
          exitCode,
          signal,
          workspacePath,
        });
      }

      return matches;
    } catch (error) {
      this.logger.debug('[FileTreeService] ripgrep content search failed', {
        error,
        workspacePath,
      });
      return new Map();
    }
  }

  private readRipgrepMatches(
    child: ReturnType<typeof spawn>,
    query: string,
    includeGitignored: boolean,
  ): Promise<RipgrepProcessResult> {
    const results = new Map<string, RipgrepContentMatch>();
    const lowerQuery = query.toLowerCase();

    return new Promise((resolve, reject) => {
      child.on('error', reject);

      const rl = createInterface({
        input: child.stdout!,
        crlfDelay: Number.POSITIVE_INFINITY,
      });

      rl.on('line', (line) => {
        if (line.length > MAX_RIPGREP_JSON_LINE_BYTES) return;

        let message: RipgrepJsonMatch | { type?: string };
        try {
          message = JSON.parse(line) as RipgrepJsonMatch | { type?: string };
        } catch {
          return;
        }

        if (message.type !== 'match') return;

        const match = message as RipgrepJsonMatch;
        const relativePath = normalizePath(match.data.path.text).replace(
          /^\.\//,
          '',
        );
        if (!relativePath) return;
        if (!includeGitignored && this.isDefaultIgnoredPath(relativePath))
          return;

        const current = results.get(relativePath) ?? {
          count: 0,
          snippets: [],
        };
        current.count += Math.max(1, match.data.submatches.length);

        if (current.snippets.length < 3) {
          current.snippets.push({
            lineNumber: match.data.line_number,
            line: this.createContentMatchSnippet(
              match.data.lines.text,
              lowerQuery,
            ),
          });
        }
        results.set(relativePath, current);
      });

      rl.on('error', reject);
      child.on('close', (exitCode, signal) =>
        resolve({ matches: results, exitCode, signal }),
      );
    });
  }

  private buildContentSearchRipgrepArgs(
    query: string,
    includeGitignored: boolean,
  ): string[] {
    const args = [
      '--json',
      '--no-config',
      '--no-ignore-global',
      '--hidden',
      '--fixed-strings',
      '--ignore-case',
      '--max-filesize',
      `${MAX_TEXT_BYTES}`,
      '-e',
      query,
    ];

    const excludedNames = includeGitignored
      ? ['.git', 'node_modules']
      : [...WATCH_IGNORED_NAMES];
    for (const name of excludedNames) {
      args.push('--glob', `!${name}/**`);
    }

    if (includeGitignored) args.push('--no-ignore');
    args.push('.');
    return args;
  }

  private createContentMatchSnippet(line: string, lowerQuery: string): string {
    const trimmed = line.trim();
    const matchIndex = trimmed.toLowerCase().indexOf(lowerQuery);
    const maxLength = 160;
    if (matchIndex === -1 || trimmed.length <= maxLength) return trimmed;

    const contextLength = Math.floor((maxLength - lowerQuery.length) / 2);
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(
      trimmed.length,
      matchIndex + lowerQuery.length + contextLength,
    );
    return `${start > 0 ? '…' : ''}${trimmed.slice(start, end)}${
      end < trimmed.length ? '…' : ''
    }`;
  }

  async listRecentFiles(
    workspaceKeys: string[],
    includeGitignored: boolean,
    limit: number,
  ): Promise<FileSearchResult[]> {
    const collected = await this.collectWorkspaceEntries(
      workspaceKeys,
      includeGitignored,
      {
        // Files only for the "recently changed" listing.
        maxResults: 5000,
        maxDepth: 12,
        includeDirectories: false,
        match: () => true,
      },
    );

    return collected
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, Math.max(0, limit))
      .map(({ absolutePath: _absolutePath, ...result }) => result);
  }

  setActiveWorkspace(workspaceKey: string | null): void {
    this.uiKarton.setState((draft) => {
      draft.fileTree.activeWorkspaceKey = workspaceKey;
    });
  }

  setViewMode(mode: 'files' | 'diff'): void {
    this.uiKarton.setState((draft) => {
      draft.fileTree.viewMode = mode;
    });
  }

  setDirectoryExpanded(
    workspaceKey: string,
    directoryPath: string,
    expanded: boolean,
  ): void {
    const normalized = this.normalizeRelative(directoryPath);
    this.uiKarton.setState((draft) => {
      const current =
        draft.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] ?? [];
      if (expanded) {
        if (!current.includes(normalized)) current.push(normalized);
      } else {
        draft.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] =
          current.filter((path) => path !== normalized);
      }
      if (expanded) {
        draft.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] =
          current;
      }
    });
  }

  private handleStateChange = (): void => {
    this.syncWatchers();
  };

  /**
   * Compute the set of directories whose contents are currently displayed for
   * a workspace — the tree root plus every expanded directory. Only these
   * directories need filesystem watching, since the tree loads directory
   * contents lazily and only renders root + expanded paths.
   */
  private getWatchedDirsForMount(
    workspaceKey: string,
    mount: WorkspaceMount,
  ): Set<string> {
    const state = this.uiKarton.state;
    const result = new Set<string>();

    // Always watch directories backing open file tabs for this mount, so an
    // external edit to an open file is detected even when the tree panel is
    // collapsed.
    for (const tab of this.getOpenFileTabs()) {
      if (tab.workspaceKey !== workspaceKey) continue;
      result.add(normalizePath(path.dirname(tab.absolutePath)));
    }

    // Tree-driven directories (root + expanded) are only watched when the
    // panel is visible.
    if (state.fileTree.visible) {
      result.add(normalizePath(mount.path));
      const expanded =
        state.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] ?? [];
      for (const relativePath of expanded) {
        if (!relativePath || this.isDefaultIgnoredPath(relativePath)) continue;
        result.add(normalizePath(path.join(mount.path, relativePath)));
      }
    }
    return result;
  }

  /**
   * Editable file tabs currently open. Read-only blobs (attachments) are
   * excluded — they never change on disk and don't need live watching.
   */
  private getOpenFileTabs(): Array<{
    workspaceKey: string;
    absolutePath: string;
  }> {
    const tabs = this.uiKarton.state.contentTabs?.tabs ?? {};
    const result: Array<{ workspaceKey: string; absolutePath: string }> = [];
    for (const tab of Object.values(tabs)) {
      const file = tab?.file;
      if (!file || file.readOnly) continue;
      result.push({
        workspaceKey: file.workspaceKey,
        absolutePath: file.absolutePath,
      });
    }
    return result;
  }

  private syncWatchers(): void {
    const mounts = this.getWatchedMounts();
    const desired = new Map(
      mounts.map((mount) => [this.getWorkspaceKey(mount), mount]),
    );

    // Signature includes the mounts AND the directories that must be watched
    // for each (root + expanded dirs), so expand/collapse re-syncs watchers
    // while unrelated state changes are cheap no-ops.
    const desiredDirsByKey = new Map<string, Set<string>>();
    for (const [key, mount] of desired) {
      desiredDirsByKey.set(key, this.getWatchedDirsForMount(key, mount));
    }
    const signature = [...desiredDirsByKey.entries()]
      .map(([key, dirs]) => `${key}:${[...dirs].sort().join(',')}`)
      .sort()
      .join('\n');

    if (signature === this.watchedMountsSignature) return;
    this.watchedMountsSignature = signature;

    // Close watchers for mounts no longer watched.
    for (const [key, watcher] of this.watchers) {
      if (desired.has(key)) continue;
      void watcher.close();
      this.watchers.delete(key);
      this.watchedDirs.delete(key);
    }

    for (const [key, desiredDirs] of desiredDirsByKey) {
      let watcher = this.watchers.get(key);
      if (!watcher) {
        // Shallow (depth: 0) watch — only the immediate children of each
        // watched directory. This avoids the expensive deep recursive scan
        // of the whole workspace that previously blocked the main process.
        watcher = chokidar.watch([...desiredDirs], {
          ignoreInitial: true,
          ignored: (candidate) => this.isDefaultIgnoredPath(candidate),
          depth: 0,
        });
        watcher.on('all', (event, changedPath) => {
          if (this.isDefaultIgnoredPath(changedPath)) return;
          this.scheduleRevisionBump(key, changedPath, event);
        });
        watcher.on('error', (error) => {
          this.logger.warn('[FileTreeService] watcher error', { key, error });
        });
        this.watchers.set(key, watcher);
        this.watchedDirs.set(key, new Set(desiredDirs));
        continue;
      }

      // Watcher already exists — incrementally add/remove watched directories.
      const current = this.watchedDirs.get(key) ?? new Set<string>();
      for (const dir of desiredDirs) {
        if (!current.has(dir)) watcher.add(dir);
      }
      for (const dir of current) {
        if (!desiredDirs.has(dir)) watcher.unwatch(dir);
      }
      this.watchedDirs.set(key, new Set(desiredDirs));
    }
  }

  private scheduleRevisionBump(
    workspaceKey: string,
    changedPath?: string,
    watcherEvent?: string,
  ): void {
    const affectedDirectory = changedPath
      ? this.invalidateDirectoryCacheForPath(workspaceKey, changedPath)
      : null;
    if (affectedDirectory !== null) {
      const pending =
        this.pendingRevisionDirectories.get(workspaceKey) ?? new Set();
      pending.add(affectedDirectory);
      this.pendingRevisionDirectories.set(workspaceKey, pending);
    }

    const existing = this.pendingRevisionTimers.get(workspaceKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingRevisionTimers.delete(workspaceKey);
      const affectedDirectories =
        this.pendingRevisionDirectories.get(workspaceKey);
      this.pendingRevisionDirectories.delete(workspaceKey);
      // Clear delete notices for any tabs whose file was re-created.
      this.uiKarton.setState((draft) => {
        if (watcherEvent === 'add' && changedPath) {
          // changedPath from chokidar is absolute; convert to workspace-
          // relative so it can be compared against tab.file.relativePath.
          const mount = this.resolveWorkspace(workspaceKey);
          const relativeCreated = mount
            ? normalizePath(path.relative(mount.path, changedPath))
            : null;
          if (relativeCreated && !relativeCreated.startsWith('..')) {
            for (const tab of Object.values(draft.contentTabs.tabs)) {
              if (
                tab.fileNotice?.kind === 'deleted' &&
                tab.file?.workspaceKey === workspaceKey &&
                tab.file.relativePath === relativeCreated
              ) {
                tab.fileNotice = undefined;
              }
            }
          }
        }
        if (affectedDirectories?.size) {
          draft.fileTree.directoryRevisions ??= {};
          draft.fileTree.directoryRevisions[workspaceKey] ??= {};
          const revisions = draft.fileTree.directoryRevisions[workspaceKey];
          for (const directoryPath of affectedDirectories) {
            revisions[directoryPath] = (revisions[directoryPath] ?? 0) + 1;
          }
        } else {
          this.invalidateWorkspaceCache(workspaceKey);
        }
        // Always bump the workspace-level revision so consumers
        // (diff view, toggle button) can react to any file change.
        draft.fileTree.workspaceRevisions[workspaceKey] =
          (draft.fileTree.workspaceRevisions[workspaceKey] ?? 0) + 1;
      });
    }, REVISION_DEBOUNCE_MS);
    this.pendingRevisionTimers.set(workspaceKey, timer);
  }

  private invalidateWorkspaceCache(workspaceKey: string): void {
    for (const key of this.directoryCache.keys()) {
      if (key.startsWith(`${workspaceKey}:`)) this.directoryCache.delete(key);
    }
  }

  private invalidateDirectoryCache(
    workspaceKey: string,
    directoryPath: string,
  ): void {
    for (const key of this.directoryCache.keys()) {
      if (key.startsWith(`${workspaceKey}:${directoryPath}:`)) {
        this.directoryCache.delete(key);
      }
    }
  }

  private invalidateDirectoryCacheForPath(
    workspaceKey: string,
    changedPath: string,
  ): string | null {
    const mount = this.resolveWorkspace(workspaceKey);
    if (!mount) return null;

    const relativePath = normalizePath(path.relative(mount.path, changedPath));
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith('../')
    ) {
      return null;
    }

    const directoryPath = this.normalizeRelative(path.dirname(relativePath));
    this.invalidateDirectoryCache(workspaceKey, directoryPath);
    return directoryPath;
  }

  private getDirectoryRevision(
    workspaceKey: string,
    directoryPath: string,
  ): number {
    return (
      this.uiKarton.state.fileTree.directoryRevisions?.[workspaceKey]?.[
        directoryPath
      ] ??
      this.uiKarton.state.fileTree.workspaceRevisions[workspaceKey] ??
      0
    );
  }

  private getMounts(): WorkspaceMount[] {
    const seen = new Map<string, WorkspaceMount>();
    for (const mount of this.uiKarton.state.workspaceMounts) {
      seen.set(mount.path, { prefix: mount.prefix, path: mount.path });
    }
    for (const agentId in this.uiKarton.state.toolbox) {
      for (const mount of this.uiKarton.state.toolbox[agentId]?.workspace
        ?.mounts ?? []) {
        seen.set(mount.path, { prefix: mount.prefix, path: mount.path });
      }
    }
    return [...seen.values()];
  }

  private getWatchedMounts(): WorkspaceMount[] {
    const state = this.uiKarton.state;

    const mountsByKey = new Map<string, WorkspaceMount>();
    const addMount = (mount: WorkspaceMount | null | undefined) => {
      if (!mount) return;
      mountsByKey.set(this.getWorkspaceKey(mount), mount);
    };

    // Always watch mounts backing open file tabs (even when the tree panel is
    // hidden), reconstructing the mount from the key so it works for files
    // whose workspace is no longer mounted.
    for (const tab of this.getOpenFileTabs()) {
      addMount(parseWorkspaceKey(tab.workspaceKey));
    }

    // The remaining tree-driven watching only applies when the panel is
    // visible.
    if (!state.fileTree.visible) return [...mountsByKey.values()];

    const allMounts = this.getMounts();
    const activeAgentId = state.browser?.lastOpenAgentId ?? null;
    if (activeAgentId) {
      for (const mount of state.toolbox[activeAgentId]?.workspace?.mounts ??
        []) {
        addMount({ prefix: mount.prefix, path: mount.path });
      }
    }

    const activeWorkspaceKey = state.fileTree.activeWorkspaceKey;
    if (activeWorkspaceKey) {
      addMount(
        allMounts.find(
          (mount) => this.getWorkspaceKey(mount) === activeWorkspaceKey,
        ),
      );
    }

    const activeTabId = state.contentTabs?.activeTabId ?? null;
    const activeTab = activeTabId ? state.contentTabs?.tabs[activeTabId] : null;
    const activeFile = activeTab?.file;
    if (activeFile && activeTab?.agentInstanceId === null) {
      addMount(
        allMounts.find(
          (mount) => this.getWorkspaceKey(mount) === activeFile.workspaceKey,
        ),
      );
    }

    return [...mountsByKey.values()];
  }

  private resolveWorkspace(workspaceKey: string): WorkspaceMount | null {
    const liveMount = this.getMounts().find(
      (mount) => this.getWorkspaceKey(mount) === workspaceKey,
    );
    if (liveMount) return liveMount;
    // Fallback: reconstruct the mount straight from the key. The key embeds
    // the absolute path, so reading/saving keeps working even when the
    // workspace is no longer mounted (unmount, restart, deleted agent) and
    // for agent-internal `att/` blobs that are never mounted as workspaces.
    return parseWorkspaceKey(workspaceKey);
  }

  private validateEntryName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name cannot be empty');
    if (trimmed === '.' || trimmed === '..') {
      throw new Error('Invalid file or folder name');
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error('Name cannot contain path separators');
    }
    return trimmed;
  }

  private async resolveTargetPath(
    workspaceKey: string,
    parentRelativePath: string,
    name: string,
  ): Promise<ValidatedPath> {
    const parent = await this.validatePath(workspaceKey, parentRelativePath);
    const parentStat = await fs.stat(parent.absolutePath);
    if (!parentStat.isDirectory()) throw new Error('Parent is not a directory');
    const relativePath = parent.relativePath
      ? `${parent.relativePath}/${name}`
      : name;
    return {
      ...parent,
      relativePath,
      absolutePath: path.join(parent.absolutePath, name),
      realPath: path.join(parent.realPath, name),
    };
  }

  private async pathExists(candidatePath: string): Promise<boolean> {
    try {
      await fs.lstat(candidatePath);
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        return (error as { code?: string }).code !== 'ENOENT';
      }
      throw error;
    }
  }

  private async isDirectory(candidatePath: string): Promise<boolean> {
    const stat = await fs.stat(candidatePath);
    return stat.isDirectory();
  }

  private async getAvailableCopyName(
    targetDirectoryPath: string,
    sourceName: string,
  ): Promise<string> {
    const extension = path.extname(sourceName);
    const baseName = extension
      ? sourceName.slice(0, -extension.length)
      : sourceName;
    const candidates = [
      `${baseName} copy${extension}`,
      ...Array.from(
        { length: 99 },
        (_, index) => `${baseName} copy ${index + 2}${extension}`,
      ),
    ];

    for (const candidate of candidates) {
      if (!(await this.pathExists(path.join(targetDirectoryPath, candidate)))) {
        return candidate;
      }
    }

    throw new Error('Could not find an available destination name');
  }

  private async createAvailableNewFile(
    directoryAbsolutePath: string,
    directoryRelativePath: string,
  ): Promise<{ fileName: string; relativePath: string }> {
    const baseName = 'new file';
    const candidates = [
      baseName,
      ...Array.from({ length: 99 }, (_, index) => `${baseName} ${index + 2}`),
    ];

    for (const candidate of candidates) {
      const candidatePath = path.join(directoryAbsolutePath, candidate);
      // O_CREAT | O_EXCL atomically creates the file only if it does not
      // already exist. This is race-free: two concurrent calls cannot
      // both succeed on the same path.
      let handle: fs.FileHandle | undefined;
      try {
        handle = await fs.open(
          candidatePath,
          fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
          0o644,
        );
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: string }).code === 'EEXIST'
        ) {
          continue;
        }
        throw error;
      }
      await handle.close();
      const relativePath = directoryRelativePath
        ? `${directoryRelativePath}/${candidate}`
        : candidate;
      return { fileName: candidate, relativePath };
    }

    throw new Error('Could not find an available file name');
  }

  private updateFileTabsAfterMove(
    workspaceKey: string,
    fromRelativePath: string,
    toRelativePath: string,
  ): void {
    const normalizedFrom = this.normalizeRelative(fromRelativePath);
    const normalizedTo = this.normalizeRelative(toRelativePath);
    const mount = this.resolveWorkspace(workspaceKey);
    const root = mount ? path.resolve(mount.path) : null;
    this.uiKarton.setState((draft) => {
      for (const tab of Object.values(draft.contentTabs.tabs)) {
        const file = tab.file;
        if (!file || file.workspaceKey !== workspaceKey) continue;
        const isExactMatch = file.relativePath === normalizedFrom;
        const isChild = file.relativePath.startsWith(`${normalizedFrom}/`);
        if (!isExactMatch && !isChild) continue;

        const suffix = isExactMatch
          ? ''
          : file.relativePath.slice(normalizedFrom.length);
        const nextRelativePath = `${normalizedTo}${suffix}`;
        file.relativePath = nextRelativePath;
        if (root) file.absolutePath = path.resolve(root, nextRelativePath);
        tab.title = path.basename(nextRelativePath) || 'File';
        tab.url = `file-tree://${encodeURIComponent(workspaceKey)}/${encodeURIComponent(nextRelativePath)}`;
        tab.fileNotice = { kind: 'moved', fromRelativePath: normalizedFrom };
      }
    });
  }

  private closeFileTabsForPath(
    workspaceKey: string,
    relativePath: string,
  ): void {
    const normalized = this.normalizeRelative(relativePath);
    this.uiKarton.setState((draft) => {
      for (const [, tab] of Object.entries(draft.contentTabs.tabs)) {
        const file = tab.file;
        if (!file || file.workspaceKey !== workspaceKey) continue;
        if (
          file.relativePath !== normalized &&
          !file.relativePath.startsWith(`${normalized}/`)
        ) {
          continue;
        }
        // Instead of closing, mark with a delete notice so the user can
        // choose to close or re-create the file.
        tab.fileNotice = { kind: 'deleted' };
      }
    });
  }

  private bumpDirectoryRevisionsNow(
    workspaceKey: string,
    directoryPaths: string[],
  ): void {
    const normalizedPaths = Array.from(
      new Set(directoryPaths.map((item) => this.normalizeRelative(item))),
    );
    for (const directoryPath of normalizedPaths) {
      this.invalidateDirectoryCache(workspaceKey, directoryPath);
    }
    this.uiKarton.setState((draft) => {
      draft.fileTree.directoryRevisions ??= {};
      draft.fileTree.directoryRevisions[workspaceKey] ??= {};
      const revisions = draft.fileTree.directoryRevisions[workspaceKey];
      for (const directoryPath of normalizedPaths) {
        revisions[directoryPath] = (revisions[directoryPath] ?? 0) + 1;
      }
    });
  }

  private async validatePath(
    workspaceKey: string,
    relativePath: string,
  ): Promise<ValidatedPath> {
    const mount = this.resolveWorkspace(workspaceKey);
    if (!mount) throw new Error('Workspace not mounted');
    const normalizedRelative = this.normalizeRelative(relativePath);
    if (path.isAbsolute(normalizedRelative)) {
      throw new Error('Absolute paths are not allowed');
    }

    const root = path.resolve(mount.path);
    const absolutePath = path.resolve(root, normalizedRelative || '.');
    const rootReal = await fs.realpath(root);
    const realPath = await fs.realpath(absolutePath);
    const relativeFromRoot = path.relative(rootReal, realPath);
    if (
      relativeFromRoot === '..' ||
      relativeFromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeFromRoot)
    ) {
      throw new Error('Path escapes workspace root');
    }

    return {
      key: this.getWorkspaceKey(mount),
      mount,
      root,
      rootReal,
      relativePath: normalizedRelative,
      absolutePath,
      realPath,
    };
  }

  private normalizeRelative(relativePath: string): string {
    const normalized = normalizePath(relativePath).replace(/^\.\//, '');
    if (!normalized || normalized === '.') return '';
    const parts = normalized.split('/').filter(Boolean);
    if (parts.includes('..')) throw new Error('Path traversal denied');
    return parts.join('/');
  }

  private async readDirectoryEntries(
    validated: ValidatedPath,
  ): Promise<FileTreeEntry[]> {
    const ig = await this.getIgnore(validated);
    const dirents = await fs.readdir(validated.absolutePath, {
      withFileTypes: true,
    });
    const entries = await Promise.all(
      dirents.map(async (dirent): Promise<FileTreeEntry | null> => {
        const relativePath = validated.relativePath
          ? `${validated.relativePath}/${dirent.name}`
          : dirent.name;
        const normalizedRelativePath = normalizePath(relativePath);
        if (this.isHiddenListingName(dirent.name)) return null;
        const ignored =
          ig.ignores(normalizedRelativePath) ||
          this.isWatchIgnoredName(dirent.name);
        const absolutePath = path.join(validated.absolutePath, dirent.name);
        const lst = await fs.lstat(absolutePath);
        const kind = dirent.isDirectory()
          ? 'directory'
          : dirent.isSymbolicLink()
            ? 'symlink'
            : 'file';
        const stat = kind === 'symlink' ? null : lst;
        return {
          name: dirent.name,
          relativePath: normalizedRelativePath,
          kind,
          size: stat?.isFile() ? stat.size : null,
          mtimeMs: stat?.mtimeMs ?? lst.mtimeMs,
          mimeType: kind === 'file' ? inferMimeType(dirent.name) : null,
          isIgnored: ignored,
          hasChildren: kind === 'directory',
        };
      }),
    );

    return entries
      .filter((entry): entry is FileTreeEntry => entry !== null)
      .sort((a, b) => {
        if (a.kind === 'directory' && b.kind !== 'directory') return -1;
        if (a.kind !== 'directory' && b.kind === 'directory') return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
  }

  private isHiddenListingName(name: string): boolean {
    return HIDDEN_LISTING_NAMES.has(name);
  }

  private isWatchIgnoredName(name: string): boolean {
    return (
      WATCH_IGNORED_NAMES.has(name) ||
      WATCH_IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(name))
    );
  }

  private isDefaultIgnoredPath(candidate: string): boolean {
    const normalized = normalizePath(candidate);
    const segments = normalized.split('/').filter(Boolean);
    return segments.some((segment) => this.isWatchIgnoredName(segment));
  }

  private async getIgnore(validated: ResolvedWorkspace): Promise<Ignore> {
    const cacheKey = validated.key;
    let cached = this.ignoreCache.get(cacheKey);
    if (!cached) {
      cached = this.loadIgnore(validated.root);
      this.ignoreCache.set(cacheKey, cached);
    }
    return cached;
  }

  private async loadIgnore(root: string): Promise<Ignore> {
    const ig = ignore();
    ig.add([...WATCH_IGNORED_NAMES].map((entry) => `${entry}/`));
    try {
      const content = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
      ig.add(content);
    } catch {
      // No .gitignore or unreadable; default ignores still apply.
    }
    return ig;
  }

  private async classifyFile(
    absolutePath: string,
    mimeType: string,
  ): Promise<FilePreviewKind> {
    if (mimeType === 'image/svg+xml') return 'svg';
    if (mimeType.startsWith('image/')) return 'image';
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml'
    ) {
      return 'text';
    }
    const ext =
      path.basename(absolutePath).split('.').pop()?.toLowerCase() ?? '';
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    if (await this.looksBinary(absolutePath)) return 'binary';
    return 'text';
  }

  private async looksBinary(absolutePath: string): Promise<boolean> {
    const handle = await fs.open(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) return true;
      }
      return false;
    } finally {
      await handle.close();
    }
  }

  private parseCursor(cursor: string | null | undefined): number {
    if (!cursor) return 0;
    const parsed = Number.parseInt(cursor, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private setCacheEntry(key: string, entry: DirectoryCacheEntry): void {
    if (this.directoryCache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = this.directoryCache.keys().next().value;
      if (firstKey) this.directoryCache.delete(firstKey);
    }
    this.directoryCache.set(key, entry);
  }

  protected override onTeardown(): void {
    this.uiKarton.unregisterStateChangeCallback(this.handleStateChange);
    for (const timer of this.pendingRevisionTimers.values())
      clearTimeout(timer);
    this.pendingRevisionTimers.clear();
    this.pendingRevisionDirectories.clear();
    for (const watcher of this.watchers.values()) void watcher.close();
    this.watchers.clear();
    this.directoryCache.clear();
    this.ignoreCache.clear();
  }
}
