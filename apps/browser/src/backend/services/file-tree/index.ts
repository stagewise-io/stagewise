import { shell } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import chokidar, { type FSWatcher } from 'chokidar';
import ignore, { type Ignore } from 'ignore';
import type { Logger } from '../logger';
import type { KartonService } from '../karton';
import type {
  AppState,
  FilePreviewKind,
  FilePreviewResult,
  FileSearchResult,
  FileTreeEntry,
  FileTreeListDirectoryInput,
  FileTreeListDirectoryResult,
  FileTabMetadata,
  OpenFileTabOptions,
  FileTreeClipboardOperation,
  FileTreeOperationResult,
} from '@shared/karton-contracts/ui';
import { inferMimeType } from '@shared/mime-utils';
import { getBaseName, normalizePath } from '@shared/path-utils';
import { DisposableService } from '../disposable';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_CACHE_ENTRIES = 200;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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

    if (kind === 'image') {
      if (stat.size > MAX_IMAGE_BYTES) return { ...base, truncated: true };
      const buffer = await fs.readFile(validated.absolutePath);
      return { ...base, base64: buffer.toString('base64') };
    }

    return base;
  }

  async saveFile(
    workspaceKey: string,
    relativePath: string,
    text: string,
  ): Promise<FilePreviewResult | null> {
    const validated = await this.validatePath(workspaceKey, relativePath);
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
      },
      agentInstanceId,
      options,
    );
  }

  async renameEntry(
    workspaceKey: string,
    relativePath: string,
    newName: string,
  ): Promise<FileTreeOperationResult> {
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

  async openExternally(
    workspaceKey: string,
    relativePath: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validated = await this.validatePath(workspaceKey, relativePath);
      const error = await shell.openPath(validated.realPath);
      return error ? { success: false, error } : { success: true };
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

  async searchFiles(
    query: string,
    workspaceKeys: string[],
    includeGitignored: boolean,
  ): Promise<FileSearchResult[]> {
    const lowerQuery = query.toLowerCase();
    const results: FileSearchResult[] = [];
    const seen = new Set<string>();

    for (const workspaceKey of workspaceKeys) {
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

      const walkDir = async (dirRelativePath: string) => {
        const absoluteDir = dirRelativePath
          ? path.join(mount.path, dirRelativePath)
          : mount.path;

        let entries: string[];
        try {
          entries = await fs.readdir(absoluteDir);
        } catch {
          return;
        }

        for (const name of entries) {
          if (name === '.git' || name === 'node_modules') continue;

          const relPath = dirRelativePath ? `${dirRelativePath}/${name}` : name;
          const absPath = path.join(absoluteDir, name);

          let stat: ReturnType<typeof fs.stat> extends Promise<infer T>
            ? T
            : never;
          try {
            stat = await fs.stat(absPath);
          } catch {
            continue;
          }

          if (stat.isSymbolicLink()) {
            try {
              const real = await fs.realpath(absPath);
              const realStat = await fs.stat(real);
              if (!realStat.isFile()) continue;
            } catch {
              continue;
            }
          }

          if (!stat.isFile()) continue;

          if (ig?.ignores(relPath)) continue;
          if (this.isDefaultIgnoredPath(relPath)) continue;

          if (name.toLowerCase().includes(lowerQuery)) {
            const mountPrefix = mount.prefix;
            const uniqueKey = `${workspaceKey}:${relPath}`;
            if (!seen.has(uniqueKey)) {
              seen.add(uniqueKey);
              results.push({
                workspaceKey,
                mountPrefix,
                relativePath: relPath,
                fileName: name,
              });
            }
          }
        }
      };

      await walkDir('');
    }

    return results;
  }

  setActiveWorkspace(workspaceKey: string | null): void {
    this.uiKarton.setState((draft) => {
      draft.fileTree.activeWorkspaceKey = workspaceKey;
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
    const result = new Set<string>([normalizePath(mount.path)]);
    const expanded =
      this.uiKarton.state.fileTree.expandedDirectoriesByWorkspaceKey[
        workspaceKey
      ] ?? [];
    for (const relativePath of expanded) {
      if (!relativePath || this.isDefaultIgnoredPath(relativePath)) continue;
      result.add(normalizePath(path.join(mount.path, relativePath)));
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
        watcher.on('all', (_event, changedPath) => {
          if (this.isDefaultIgnoredPath(changedPath)) return;
          this.scheduleRevisionBump(key, changedPath);
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
      this.uiKarton.setState((draft) => {
        if (affectedDirectories?.size) {
          draft.fileTree.directoryRevisions ??= {};
          draft.fileTree.directoryRevisions[workspaceKey] ??= {};
          const revisions = draft.fileTree.directoryRevisions[workspaceKey];
          for (const directoryPath of affectedDirectories) {
            revisions[directoryPath] = (revisions[directoryPath] ?? 0) + 1;
          }
          return;
        }

        this.invalidateWorkspaceCache(workspaceKey);
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
    if (!state.fileTree.visible) return [];

    const mountsByKey = new Map<string, WorkspaceMount>();
    const allMounts = this.getMounts();
    const addMount = (mount: WorkspaceMount | null | undefined) => {
      if (!mount) return;
      mountsByKey.set(this.getWorkspaceKey(mount), mount);
    };

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
    return (
      this.getMounts().find(
        (mount) => this.getWorkspaceKey(mount) === workspaceKey,
      ) ?? null
    );
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
      }
    });
  }

  private closeFileTabsForPath(
    workspaceKey: string,
    relativePath: string,
  ): void {
    const normalized = this.normalizeRelative(relativePath);
    this.uiKarton.setState((draft) => {
      for (const [tabId, tab] of Object.entries(draft.contentTabs.tabs)) {
        const file = tab.file;
        if (!file || file.workspaceKey !== workspaceKey) continue;
        if (
          file.relativePath !== normalized &&
          !file.relativePath.startsWith(`${normalized}/`)
        ) {
          continue;
        }
        delete draft.contentTabs.tabs[tabId];
        this.cleanupContentTabOrders(draft.contentTabs, tabId);
        if (draft.contentTabs.activeTabId === tabId) {
          draft.contentTabs.activeTabId = this.getFallbackContentTabId(
            draft.contentTabs,
          );
        }
      }
    });
  }

  private cleanupContentTabOrders(
    contentTabs: AppState['contentTabs'],
    removedTabId: string,
  ): void {
    contentTabs.globalOrder = contentTabs.globalOrder.filter(
      (id) => id !== removedTabId,
    );
    for (const agentId of Object.keys(contentTabs.agentOrders)) {
      contentTabs.agentOrders[agentId] = contentTabs.agentOrders[
        agentId
      ]!.filter((id) => id !== removedTabId);
      if (contentTabs.agentOrders[agentId]!.length === 0) {
        delete contentTabs.agentOrders[agentId];
      }
    }
  }

  private getFallbackContentTabId(
    contentTabs: AppState['contentTabs'],
  ): string | null {
    return (
      contentTabs.globalOrder.find((id) => contentTabs.tabs[id]) ??
      Object.values(contentTabs.agentOrders)
        .flat()
        .find((id) => contentTabs.tabs[id]) ??
      Object.keys(contentTabs.tabs)[0] ??
      null
    );
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

export function getFileTreeTabTitle(relativePath: string): string {
  return getBaseName(relativePath) || 'File';
}
