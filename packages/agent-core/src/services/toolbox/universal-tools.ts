import path from 'node:path';
import { tool } from 'ai';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import {
  copyFile,
  mkdir as fsMkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from '../../fs';
import type {
  CopyToolInput,
  DeleteToolInput,
  GlobToolInput,
  GrepSearchToolInput,
  LsToolInput,
  MkdirToolInput,
  MultiEditToolInput,
  StagewiseToolSet,
  UniversalToolSchemas,
  WithDiff,
  WriteToolInput,
  readToolInput,
} from '../../types/tools';
import {
  copyToolInputSchema,
  copyToolOutputSchema,
  deleteToolInputSchema,
  deleteToolOutputSchema,
  globToolInputSchema,
  globToolOutputSchema,
  grepSearchToolInputSchema,
  grepSearchToolOutputSchema,
  lsToolInputSchema,
  lsToolSchema,
  mkdirToolInputSchema,
  mkdirToolOutputSchema,
  multiEditToolInputSchema,
  multiEditToolOutputSchema,
  readToolInputSchema,
  readToolOutputSchema,
  writeToolInputSchema,
  writeToolOutputSchema,
} from '../../types/tools';
import type { UniversalToolboxDeps } from './types';
import { findWorkspaceRootForPath, resolveToolPath } from './path-resolution';
import {
  buildAgentFileEditContent,
  capToolOutput,
  captureFileState,
  cleanupTempFile,
  formatTruncationMessage,
  rethrowCappedToolOutputError,
  truncatePreview,
} from './utils';

const READ_DESCRIPTION = `Read metadata and contents of a file. Equals \`cat\` / \`echo\` in bash. For directories, use \`ls\` instead.
If the file is not in context after the tool call, this **ALWAYS** implies that the file has **NOT** changed since the last read that is already in your context!
Large files are truncated to a dynamic token budget. To read a large file efficiently, issue multiple parallel read calls with non-overlapping \`start_line\`/\`end_line\` ranges.

The \`preview\` parameter controls the output format:
- **\`preview: true\`** — Returns a structural outline instead of raw content.
- **\`preview: false\` (default)** — Returns the full file content, line-numbered and truncated to budget.`;

const LS_DESCRIPTION = `List files and directories in a directory path. Equals \`ls\` / \`tree\` in bash. For reading file contents, use \`read\` instead.`;
const MKDIR_DESCRIPTION = `Create a directory (and any missing parent directories).

Parameters:
- path (string, REQUIRED): Directory path to create. Must include a valid mount prefix. Parent directories are created automatically.

Behavior: No-op if the directory already exists. Throws if path points to an existing file or if the mount is read-only.`;
const WRITE_DESCRIPTION = `Write content to a file. Overrides existing file contents. Creates parent directories if needed.`;
const MULTI_EDIT_DESCRIPTION = `Make multiple find-and-replace edits to a single file in one operation. CRITICAL: Edits are applied SEQUENTIALLY - each edit sees the results of previous edits.`;
const DELETE_DESCRIPTION = `Delete a file or directory from the file system with undo capability.`;
const COPY_DESCRIPTION = `Copy or move a file or directory. Use this to rename files or directories by moving them. Throws error if source doesn't exist or if trying to copy a directory into an existing file.`;
const GLOB_DESCRIPTION = `Find files and directories BY THEIR PATH/NAME using glob patterns (like 'find' command). Use when searching for files by name or extension. NOT for searching inside file contents (use grepSearch for that).`;
const GREP_DESCRIPTION = `Fast regex search INSIDE file contents using ripgrep. Use to find code patterns, function definitions, or specific text within files. NOT for finding files by name (use glob for that).`;

function getToolCallId(options: unknown): string {
  return (
    (options as { toolCallId?: string } | undefined)?.toolCallId ??
    `tool-call-${Date.now()}`
  );
}

function tempDir(deps: UniversalToolboxDeps): string {
  return path.join(deps.hostPaths.tempDir(), 'agent-temp-files');
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}

function stripCodeFence(content: string): string {
  let cleanContent = content;
  if (cleanContent.startsWith('```')) {
    const lines = cleanContent.split('\n');
    if (lines[0]?.trim().startsWith('```')) lines.shift();
    cleanContent = lines.join('\n');
  }
  if (cleanContent.endsWith('```')) {
    const lines = cleanContent.split('\n');
    if (lines[lines.length - 1]?.trim() === '```') lines.pop();
    cleanContent = lines.join('\n');
  }
  return cleanContent;
}

async function registerSingleEdit(
  deps: UniversalToolboxDeps,
  absolutePath: string,
  toolCallId: string,
  beforeState: Awaited<ReturnType<typeof captureFileState>>,
  afterState: Awaited<ReturnType<typeof captureFileState>>,
): Promise<WithDiff<object>['_diff']> {
  if (!deps.diffHistoryService) return null;

  try {
    const { editContent, tempFilesToCleanup } = await buildAgentFileEditContent(
      beforeState,
      afterState,
      tempDir(deps),
    );

    if (!editContent.isExternal && editContent.contentAfter !== null) {
      void deps.mutations?.onTextFileWritten?.(
        deps.agentInstanceId,
        absolutePath,
        editContent.contentAfter,
      );
    } else if (!editContent.isExternal && editContent.contentBefore !== null) {
      void deps.mutations?.onTextFileClosed?.(
        deps.agentInstanceId,
        absolutePath,
      );
    }

    await deps.diffHistoryService.registerAgentEdit({
      agentInstanceId: deps.agentInstanceId,
      path: absolutePath,
      toolCallId,
      workspaceRoot: findWorkspaceRootForPath(deps, absolutePath),
      ...editContent,
    });

    for (const tempFile of tempFilesToCleanup) void cleanupTempFile(tempFile);
  } catch (error) {
    deps.logger?.error('[UniversalToolbox] Failed to register agent edit', {
      error,
      path: absolutePath,
      toolCallId,
    });
  }

  return !beforeState.isExternal && !afterState.isExternal
    ? { before: beforeState.content, after: afterState.content }
    : null;
}

async function mutateSinglePath<T extends object>(
  deps: UniversalToolboxDeps,
  absolutePath: string,
  toolCallId: string,
  mutate: () => Promise<T>,
): Promise<WithDiff<T>> {
  const beforeState = await captureFileState(absolutePath, tempDir(deps));
  deps.diffHistoryService?.ignoreFileForWatcher(absolutePath);
  try {
    const result = await mutate();
    const afterState = await captureFileState(absolutePath, tempDir(deps));
    const _diff = await registerSingleEdit(
      deps,
      absolutePath,
      toolCallId,
      beforeState,
      afterState,
    );
    return { ...result, _diff };
  } finally {
    setTimeout(
      () => deps.diffHistoryService?.unignoreFileForWatcher(absolutePath),
      500,
    );
  }
}

async function copyDirectoryRecursive(
  src: string,
  dest: string,
): Promise<void> {
  await fsMkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDirectoryRecursive(srcPath, destPath);
    else await copyFile(srcPath, destPath);
  }
}

/**
 * Enumerate every regular file under `absolutePath`. Used by `delete` and
 * `move` to register per-file diff-history entries for structural fs
 * operations (matches origin/main behavior — without this, watcher
 * notifications surface as "external" changes and the agent's edit
 * summary loses every child of a directory delete / the source side of
 * a move).
 *
 * Returns `[absolutePath]` for single files and `[]` when the path is
 * missing entirely (the caller still proceeds; downstream ops handle the
 * missing case).
 */
async function collectAllFiles(absolutePath: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  if (await isDirectory(absolutePath)) await walk(absolutePath);
  else if (await exists(absolutePath)) out.push(absolutePath);
  return out;
}

export async function readToolExecute(
  params: readToolInput,
  deps: UniversalToolboxDeps,
) {
  if (
    params.start_line !== undefined &&
    params.end_line !== undefined &&
    params.start_line > params.end_line
  ) {
    throw new Error('end_line must be equal or larger than start_line');
  }
  if (
    params.start_page !== undefined &&
    params.end_page !== undefined &&
    params.start_page > params.end_page
  ) {
    throw new Error('end_page must be equal or larger than start_page');
  }

  try {
    const resolved = resolveToolPath(deps, params.path, 'read');
    if (!(await exists(resolved.absolutePath))) {
      throw new Error('File or directory does not exist or is not accessible');
    }
    return { message: 'File opened and loaded into context.' };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export async function lsToolExecute(
  params: LsToolInput,
  deps: UniversalToolboxDeps,
) {
  try {
    const resolved = resolveToolPath(deps, params.path, 'read');
    if (!(await exists(resolved.absolutePath))) {
      throw new Error('Directory does not exist or is not accessible');
    }
    return;
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export async function mkdirToolExecute(
  params: MkdirToolInput,
  deps: UniversalToolboxDeps,
) {
  try {
    const resolved = resolveToolPath(deps, params.path, 'create');
    if (await isDirectory(resolved.absolutePath)) {
      return { message: `Directory already exists: ${params.path}` };
    }
    if (await exists(resolved.absolutePath)) {
      throw new Error(
        `A file already exists at ${params.path}. Cannot create directory.`,
      );
    }
    await fsMkdir(resolved.absolutePath, { recursive: true });
    return { message: `Created directory: ${params.path}` };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export async function writeToolExecute(
  params: WriteToolInput,
  deps: UniversalToolboxDeps,
  options?: unknown,
) {
  const resolved = resolveToolPath(deps, params.path, 'write');
  const fileExists = await exists(resolved.absolutePath);
  const cleanContent = stripCodeFence(params.content);
  return mutateSinglePath(
    deps,
    resolved.absolutePath,
    getToolCallId(options),
    async () => {
      await fsMkdir(path.dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, cleanContent);
      const action = fileExists ? 'updated' : 'created';
      let message = `Successfully ${action} file: ${resolved.relativePath}`;
      if (cleanContent.length > 4000) {
        message +=
          `\n\n⚠️ Large file write (${cleanContent.length} chars). ` +
          'Prefer incremental edits rather than making large changes like this again.';
      }
      return { message };
    },
  );
}

export async function multiEditToolExecute(
  params: MultiEditToolInput,
  deps: UniversalToolboxDeps,
  options?: unknown,
) {
  if (params.edits.length === 0) {
    throw new Error(
      'Missing required parameter: edits (must contain at least one edit)',
    );
  }
  const resolved = resolveToolPath(deps, params.path, 'write');
  if (!(await exists(resolved.absolutePath))) {
    throw new Error(`File does not exist: ${resolved.relativePath}`);
  }
  return mutateSinglePath(
    deps,
    resolved.absolutePath,
    getToolCallId(options),
    async () => {
      let content = await readFile(resolved.absolutePath, 'utf-8');
      let totalEditsApplied = 0;
      for (const edit of params.edits) {
        const { old_string, new_string, replace_all = false } = edit;
        const occurrences = content.split(old_string).length - 1;
        if (occurrences === 0) continue;
        if (replace_all) {
          content = content.split(old_string).join(new_string);
          totalEditsApplied += occurrences;
        } else {
          const index = content.indexOf(old_string);
          if (index !== -1) {
            content =
              content.substring(0, index) +
              new_string +
              content.substring(index + old_string.length);
            totalEditsApplied += 1;
          }
        }
      }
      if (totalEditsApplied > 0)
        await writeFile(resolved.absolutePath, content);
      return {
        message:
          totalEditsApplied === 0
            ? `Applied 0 edits to ${resolved.relativePath}.`
            : `Successfully applied ${totalEditsApplied} edits`,
        result: { editsApplied: totalEditsApplied },
      };
    },
  );
}

export async function deleteToolExecute(
  params: DeleteToolInput,
  deps: UniversalToolboxDeps,
  options?: unknown,
) {
  const resolved = resolveToolPath(deps, params.path, 'delete');
  if (!(await exists(resolved.absolutePath)))
    throw new Error('File or directory not found');

  // Single-file delete keeps the simple `mutateSinglePath` flow (capture →
  // rm → register one edit). Directory delete needs per-child tracking
  // so each removed file shows up in the agent's edit history and the
  // watcher does not surface them as "external" deletions. Matches
  // origin/main's split between single-file and directory delete.
  const targetIsDir = await isDirectory(resolved.absolutePath);
  if (!targetIsDir) {
    return mutateSinglePath(
      deps,
      resolved.absolutePath,
      getToolCallId(options),
      async () => {
        await rm(resolved.absolutePath, { recursive: true, force: true });
        return {};
      },
    );
  }

  const childFiles = await collectAllFiles(resolved.absolutePath);
  const beforeStates = new Map<
    string,
    Awaited<ReturnType<typeof captureFileState>>
  >();
  for (const childFile of childFiles) {
    beforeStates.set(
      childFile,
      await captureFileState(childFile, tempDir(deps)),
    );
    deps.diffHistoryService?.ignoreFileForWatcher(childFile);
  }

  try {
    await rm(resolved.absolutePath, { recursive: true, force: true });
    for (const childFile of childFiles) {
      const before = beforeStates.get(childFile);
      if (!before) continue;
      const after = await captureFileState(childFile, tempDir(deps));
      await registerSingleEdit(
        deps,
        childFile,
        getToolCallId(options),
        before,
        after,
      );
    }
    return { _diff: null };
  } finally {
    for (const childFile of childFiles) {
      setTimeout(
        () => deps.diffHistoryService?.unignoreFileForWatcher(childFile),
        500,
      );
    }
  }
}

export async function copyToolExecute(
  params: CopyToolInput,
  deps: UniversalToolboxDeps,
  options?: unknown,
) {
  const src = resolveToolPath(deps, params.input_path, 'read');
  const dest = resolveToolPath(deps, params.output_path, 'create');
  const srcExists = await exists(src.absolutePath);
  const srcIsDir = await isDirectory(src.absolutePath);
  if (!srcExists && !srcIsDir)
    throw new Error(`Source not found: ${params.input_path}`);

  const destIsDir = await isDirectory(dest.absolutePath);
  let finalDest = dest.absolutePath;
  if (!srcIsDir && destIsDir)
    finalDest = path.join(dest.absolutePath, path.basename(src.absolutePath));

  // Diff-history needs per-file tracking on BOTH sides of a copy/move so
  // every created file shows up in the agent's edit summary and so undo
  // can replay the full delta. Origin/main enumerated children for
  // directory ops; the universal-tools port collapsed everything to a
  // single path which (a) crashed with EISDIR on directory dest paths
  // and (b) made dir-move undo asymmetric (src restored, dest left in
  // place — duplicating the tree). Mirror main: collect src children
  // up-front, derive dest equivalents by re-rooting under
  // `dest.absolutePath`, then track each pair through the existing
  // `registerSingleEdit` helper.
  const toolCallId = getToolCallId(options);
  const srcFiles = srcIsDir
    ? await collectAllFiles(src.absolutePath)
    : [src.absolutePath];
  const destFiles = srcIsDir
    ? srcFiles.map((srcFile) => {
        const rel = path.relative(src.absolutePath, srcFile);
        return path.join(dest.absolutePath, rel);
      })
    : [finalDest];

  const destBeforeStates = new Map<
    string,
    Awaited<ReturnType<typeof captureFileState>>
  >();
  for (const destFile of destFiles) {
    destBeforeStates.set(
      destFile,
      await captureFileState(destFile, tempDir(deps)),
    );
    deps.diffHistoryService?.ignoreFileForWatcher(destFile);
  }

  // Source-side tracking is only meaningful for moves — copies leave
  // the source intact, so registering it as a deletion would be wrong.
  const srcBeforeStates = new Map<
    string,
    Awaited<ReturnType<typeof captureFileState>>
  >();
  if (params.move) {
    for (const srcFile of srcFiles) {
      srcBeforeStates.set(
        srcFile,
        await captureFileState(srcFile, tempDir(deps)),
      );
      deps.diffHistoryService?.ignoreFileForWatcher(srcFile);
    }
  }

  try {
    if (srcIsDir) {
      if ((await exists(dest.absolutePath)) && !destIsDir) {
        throw new Error(
          `Cannot copy directory into existing file: ${params.output_path}`,
        );
      }
      await copyDirectoryRecursive(src.absolutePath, dest.absolutePath);
      if (params.move)
        await rm(src.absolutePath, { recursive: true, force: true });
    } else {
      await fsMkdir(path.dirname(finalDest), { recursive: true });
      if (params.move) {
        try {
          await rename(src.absolutePath, finalDest);
        } catch {
          await copyFile(src.absolutePath, finalDest);
          await unlink(src.absolutePath);
        }
      } else {
        await copyFile(src.absolutePath, finalDest);
      }
    }

    let firstDestDiff: WithDiff<object>['_diff'] = null;
    for (const destFile of destFiles) {
      const before = destBeforeStates.get(destFile);
      if (!before) continue;
      const after = await captureFileState(destFile, tempDir(deps));
      const diff = await registerSingleEdit(
        deps,
        destFile,
        toolCallId,
        before,
        after,
      );
      // Preserve the existing `_diff` return shape for single-file ops
      // (`destFiles.length === 1`) — return the only diff captured.
      // For directory ops there are multiple deltas; surfacing only the
      // first would be misleading, so leave `_diff` null and rely on
      // the registered diff-history entries.
      if (destFiles.length === 1) firstDestDiff = diff;
    }

    if (params.move) {
      for (const srcFile of srcFiles) {
        const srcBefore = srcBeforeStates.get(srcFile);
        if (!srcBefore) continue;
        const srcAfter = await captureFileState(srcFile, tempDir(deps));
        await registerSingleEdit(
          deps,
          srcFile,
          toolCallId,
          srcBefore,
          srcAfter,
        );
      }
    }

    const action = params.move ? 'Moved' : 'Copied';
    return {
      message: `${action} ${srcIsDir ? 'directory' : 'file'}: ${params.input_path} → ${params.output_path}`,
      _diff: firstDestDiff,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  } finally {
    for (const destFile of destFiles) {
      setTimeout(
        () => deps.diffHistoryService?.unignoreFileForWatcher(destFile),
        500,
      );
    }
    if (params.move) {
      for (const srcFile of srcFiles) {
        setTimeout(
          () => deps.diffHistoryService?.unignoreFileForWatcher(srcFile),
          500,
        );
      }
    }
  }
}

/**
 * glob/grep delegate the actual FS walk to `@stagewise/agent-runtime-node`'s
 * `ClientRuntimeNode`, which dispatches ripgrep-first and falls back to a
 * minimatch + `ignore` + iterative walk implementation when the rg binary is
 * absent. Host-supplied `rgBinaryBasePath` controls the rg location; an empty
 * value cleanly opts into the JS fallback.
 *
 * Cache keyed by absolute mount root so multiple agents sharing a workspace
 * reuse the same runtime (and its memoized gitignore tree). Created lazily
 * the first time a tool call touches a given mount.
 */
function makeRuntimeCache(rgBinaryBasePath: string | undefined): {
  get: (mountRoot: string) => ClientRuntimeNode;
} {
  const cache = new Map<string, ClientRuntimeNode>();
  return {
    get(mountRoot: string) {
      const cached = cache.get(mountRoot);
      if (cached) return cached;
      const runtime = new ClientRuntimeNode({
        workingDirectory: mountRoot,
        rgBinaryBasePath: rgBinaryBasePath ?? '',
      });
      cache.set(mountRoot, runtime);
      return runtime;
    },
  };
}

export async function globToolExecute(
  params: GlobToolInput,
  deps: UniversalToolboxDeps,
  runtimeCache?: { get: (mountRoot: string) => ClientRuntimeNode },
) {
  const resolved = resolveToolPath(deps, `${params.mount_prefix}/`, 'read');
  const cache = runtimeCache ?? makeRuntimeCache(deps.rgBinaryBasePath);
  const runtime = cache.get(resolved.mountRoot);
  const r = await runtime.fileSystem.glob(params.pattern, {
    respectGitignore: !params.include_gitignored,
    maxResults: 50,
  });
  if (!r.success) {
    throw new Error(r.error ?? r.message);
  }

  const relativePaths = r.relativePaths ?? [];
  const totalMatches = r.totalMatches ?? relativePaths.length;
  const cappedPaths = capToolOutput(relativePaths, { maxItems: 50 });
  let message = `Found ${totalMatches} matches for pattern "${params.pattern}" in "${resolved.mountRoot}"`;
  if (cappedPaths.truncated) {
    message += formatTruncationMessage(cappedPaths.itemsRemoved, totalMatches, [
      'Use a more specific glob pattern (e.g., "src/**/*.ts" instead of "**/*.ts")',
      'Break down your search into multiple smaller queries',
    ]);
  }
  return {
    message,
    result: {
      totalMatches,
      relativePaths: cappedPaths.result,
      truncated: cappedPaths.truncated,
      itemsRemoved: cappedPaths.itemsRemoved,
    },
  };
}

export async function grepSearchToolExecute(
  params: GrepSearchToolInput,
  deps: UniversalToolboxDeps,
  runtimeCache?: { get: (mountRoot: string) => ClientRuntimeNode },
) {
  const resolved = resolveToolPath(deps, `${params.mount_prefix}/`, 'read');
  const cache = runtimeCache ?? makeRuntimeCache(deps.rgBinaryBasePath);
  const runtime = cache.get(resolved.mountRoot);
  const maxMatches = Math.min(params.max_matches ?? 15, 50);

  const r = await runtime.fileSystem.grep(params.query, {
    recursive: true,
    caseSensitive: params.case_sensitive,
    filePattern: params.include_file_pattern,
    excludePatterns: params.exclude_file_pattern
      ? [params.exclude_file_pattern]
      : undefined,
    respectGitignore: !params.include_gitignored,
    maxMatches,
  });
  if (!r.success) {
    throw new Error(r.error ?? r.message);
  }

  const rawMatches = r.matches ?? [];
  const matches = rawMatches.map((m) => ({
    // Normalize to POSIX separators so results are stable across OSes
    // (the runtime returns native separators on Windows, e.g. `src\a.ts`)
    // and consistent with glob's already-normalized `relativePaths`.
    path: m.relativePath.replace(/\\/g, '/'),
    line: m.line,
    preview: truncatePreview(m.preview ?? m.match ?? '', 500),
  }));
  const filesSearched = r.filesSearched ?? 0;
  const totalMatches = r.totalMatches ?? matches.length;

  const cappedMatches = capToolOutput(matches, { maxItems: maxMatches });
  const matchCountTruncated = totalMatches >= maxMatches;
  const wasTruncated = matchCountTruncated || cappedMatches.truncated;
  let message = matchCountTruncated
    ? `Found ${maxMatches}+ matches (showing first ${maxMatches})`
    : `Found ${totalMatches} matches`;
  message += ` in ${filesSearched} files`;
  if (params.include_file_pattern)
    message += ` (included: ${params.include_file_pattern})`;
  if (params.exclude_file_pattern)
    message += ` (excluded: ${params.exclude_file_pattern})`;
  if (wasTruncated && cappedMatches.itemsRemoved) {
    message += formatTruncationMessage(
      cappedMatches.itemsRemoved,
      totalMatches,
      [
        'Use include_file_pattern to search specific file types (e.g., "*.ts")',
        'Use exclude_file_pattern to skip irrelevant directories (e.g., "metadata/**")',
        'Use a more specific regex pattern',
      ],
    );
  }
  return {
    message,
    result: {
      totalMatches,
      filesSearched,
      matches: cappedMatches.result,
      truncated: wasTruncated,
      itemsRemoved: cappedMatches.itemsRemoved,
    },
  };
}

export function makeUniversalTools(
  deps: UniversalToolboxDeps,
): Partial<StagewiseToolSet<UniversalToolSchemas>> {
  const runtimeCache = makeRuntimeCache(deps.rgBinaryBasePath);
  return {
    read: tool({
      description: READ_DESCRIPTION,
      inputSchema: readToolInputSchema,
      outputSchema: readToolOutputSchema,
      strict: false,
      execute: (args) => readToolExecute(args, deps),
    }),
    ls: tool({
      description: LS_DESCRIPTION,
      inputSchema: lsToolInputSchema,
      outputSchema: lsToolSchema.outputSchema,
      strict: false,
      execute: (args) => lsToolExecute(args, deps),
    }),
    mkdir: tool({
      description: MKDIR_DESCRIPTION,
      inputSchema: mkdirToolInputSchema,
      outputSchema: mkdirToolOutputSchema,
      strict: false,
      execute: (args) => mkdirToolExecute(args, deps),
    }),
    write: tool({
      description: WRITE_DESCRIPTION,
      inputSchema: writeToolInputSchema,
      outputSchema: writeToolOutputSchema,
      strict: false,
      execute: (args, options) => writeToolExecute(args, deps, options),
    }),
    multiEdit: tool({
      description: MULTI_EDIT_DESCRIPTION,
      inputSchema: multiEditToolInputSchema,
      outputSchema: multiEditToolOutputSchema,
      strict: false,
      execute: (args, options) => multiEditToolExecute(args, deps, options),
    }),
    delete: tool({
      description: DELETE_DESCRIPTION,
      inputSchema: deleteToolInputSchema,
      outputSchema: deleteToolOutputSchema,
      strict: false,
      execute: (args, options) => deleteToolExecute(args, deps, options),
    }),
    copy: tool({
      description: COPY_DESCRIPTION,
      inputSchema: copyToolInputSchema,
      outputSchema: copyToolOutputSchema,
      strict: false,
      execute: (args, options) => copyToolExecute(args, deps, options),
    }),
    glob: tool({
      description: GLOB_DESCRIPTION,
      inputSchema: globToolInputSchema,
      outputSchema: globToolOutputSchema,
      strict: false,
      execute: (args) => globToolExecute(args, deps, runtimeCache),
    }),
    grepSearch: tool({
      description: GREP_DESCRIPTION,
      inputSchema: grepSearchToolInputSchema,
      outputSchema: grepSearchToolOutputSchema,
      strict: false,
      execute: (args) => grepSearchToolExecute(args, deps, runtimeCache),
    }),
  };
}
