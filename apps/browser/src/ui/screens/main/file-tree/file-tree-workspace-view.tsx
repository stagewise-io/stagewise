import { Button } from '@stagewise/stage-ui/components/button';
import { toast } from '@stagewise/stage-ui/components/toaster';
import { cn } from '@ui/utils';
import { ShortcutCombo } from '@stagewise/stage-ui/components/shortcut-key';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  ClipboardIcon,
  ClipboardPasteIcon,
  CopyIcon,
  FilePlusIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Loader2Icon,
  PencilIcon,
  ScissorsIcon,
  Trash2Icon,
} from 'lucide-react';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu as MenuBase } from '@base-ui/react/menu';
import { FileTreeNode } from './file-tree-node';
import type { FileTreeClipboardOperation } from '@shared/karton-contracts/ui';
import { getCurrentPlatform } from '@shared/hotkeys';
import { normalizePath } from '@shared/path-utils';
import { nativeFileManagerLabel } from '@shared/ide-url';
import {
  getAllFileTreeWorkspaceMounts,
  getFileTreeWorkspaceKey,
  isReadOnlyWorkspaceKey,
} from './file-tree-utils';
import {
  getEffectiveFileTreeActionPaths,
  selectAllFileTreeEntries,
  updateFileTreeSelection,
} from './file-tree-selection';
import { type FileTreeRow, useFileTreeEntries } from './use-file-tree-entries';

const getParentDirectory = (relativePath: string): string => {
  const slashIndex = relativePath.lastIndexOf('/');
  return slashIndex === -1 ? '' : relativePath.slice(0, slashIndex);
};

const isFileTreeEntryKeyTarget = (
  target: EventTarget | null,
  tree: HTMLDivElement | null,
): boolean => {
  if (!(target instanceof HTMLElement) || !tree?.contains(target)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  ) {
    return false;
  }
  const entry = target.closest<HTMLElement>('[data-file-tree-entry-path]');
  return entry !== null && tree.contains(entry);
};

type FileTreeClipboardItem = {
  workspaceKey: string;
  relativePaths: string[];
  operation: FileTreeClipboardOperation;
};

type FileTreeDragPayload = {
  workspaceKey: string;
  relativePaths: string[];
};

const FILE_TREE_MOVE_MIME = 'application/x-stagewise-file-tree-move';
const EMPTY_DRAG_FILE_PATHS: string[] = [];

const contextMenuItemClassName = cn(
  'flex w-full cursor-default flex-row items-center gap-2',
  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
  'transition-colors duration-150 ease-out',
  'hover:bg-surface-1 data-highlighted:bg-surface-1',
  'data-disabled:pointer-events-none data-disabled:opacity-45',
);

const isMac = getCurrentPlatform() === 'mac';

function contextMenuShortcut(key: string): string {
  if (isMac) return `\u2318${key}`;
  return `Ctrl+${key}`;
}

function getFileName(relativePath: string): string {
  return relativePath.split('/').pop() ?? relativePath;
}

function parseFileTreeDragPayload(
  event: DragEvent<HTMLElement>,
): FileTreeDragPayload | null {
  const raw = event.dataTransfer.getData(FILE_TREE_MOVE_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FileTreeDragPayload>;
    if (
      typeof parsed.workspaceKey !== 'string' ||
      !Array.isArray(parsed.relativePaths) ||
      !parsed.relativePaths.every((path) => typeof path === 'string')
    ) {
      return null;
    }
    return {
      workspaceKey: parsed.workspaceKey,
      relativePaths: parsed.relativePaths,
    };
  } catch {
    return null;
  }
}

const platform = getCurrentPlatform();
const isSelectionModifierPressed = (
  event: Pick<MouseEvent | KeyboardEvent, 'metaKey' | 'ctrlKey'>,
): boolean => (platform === 'mac' ? event.metaKey : event.ctrlKey);

type FileTreeWorkspaceViewProps = {
  workspaceKey: string | null;
  onPreviewTargetChange: (relativePath: string | null) => void;
};

export function FileTreeWorkspaceView({
  workspaceKey,
  onPreviewTargetChange,
}: FileTreeWorkspaceViewProps) {
  const setDirectoryExpanded = useKartonProcedure(
    (p) => p.fileTree.setDirectoryExpanded,
  );
  const openFileTab = useKartonProcedure((p) => p.fileTree.openFileTab);
  const revealInFolder = useKartonProcedure((p) => p.fileTree.revealInFolder);
  const renameEntry = useKartonProcedure((p) => p.fileTree.renameEntry);
  const pasteEntry = useKartonProcedure((p) => p.fileTree.pasteEntry);
  const deleteEntry = useKartonProcedure((p) => p.fileTree.deleteEntry);
  const createFile = useKartonProcedure((p) => p.fileTree.createFile);
  const createFolder = useKartonProcedure((p) => p.fileTree.createFolder);
  const copyText = useKartonProcedure((p) => p.browser.copyText);
  const [openAgent] = useOpenAgent();
  const workspaceMount = useKartonState((s) =>
    workspaceKey
      ? (getAllFileTreeWorkspaceMounts(s).find(
          (mount) => getFileTreeWorkspaceKey(mount) === workspaceKey,
        ) ?? null)
      : null,
  );
  const selectedRelativePath = useKartonState((s) => {
    const activeTabId = s.contentTabs.activeTabId;
    if (!activeTabId || !workspaceKey) return null;
    const file = s.contentTabs.tabs[activeTabId]?.file;
    const tab = activeTabId ? s.contentTabs.tabs[activeTabId] : null;
    if (tab?.lifecycle.kind === 'temporary') return null;
    return file?.workspaceKey === workspaceKey ? file.relativePath : null;
  });
  const activePermanentFileRelativePath = useKartonState((s) => {
    const activeTabId = s.contentTabs.activeTabId;
    if (!activeTabId || !workspaceKey) return null;
    const tab = s.contentTabs.tabs[activeTabId];
    const file = tab?.file;
    if (tab?.lifecycle.kind !== 'permanent') return null;
    return file?.workspaceKey === workspaceKey ? file.relativePath : null;
  });
  const shownRelativePath = useKartonState((s) => {
    const activeTabId = s.contentTabs.activeTabId;
    if (!activeTabId || !workspaceKey) return null;
    const file = s.contentTabs.tabs[activeTabId]?.file;
    return file?.workspaceKey === workspaceKey ? file.relativePath : null;
  });
  const { rows, loadMore } = useFileTreeEntries(workspaceKey);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef<{
    value: string;
    timer: number | null;
  }>({ value: '', timer: null });
  const restoreFocusTimersRef = useRef<number[]>([]);
  const pendingNewEntryRef = useRef<string[]>([]);
  const openAfterRenameRef = useRef<Set<string>>(new Set());
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const workspaceKeyRef = useRef(workspaceKey);
  workspaceKeyRef.current = workspaceKey;

  // When the displayed workspace changes, clear all pending state from the
  // previous workspace. Stale entries could otherwise match paths in the new
  // workspace (wrong rename target) or block the queue indefinitely.
  useEffect(() => {
    pendingNewEntryRef.current = [];
    openAfterRenameRef.current = new Set();
    setRenamingPath(null);
  }, [workspaceKey]);
  const [focusedEntryPath, setFocusedEntryPath] = useState<string | null>(null);
  const [selectedEntryPaths, setSelectedEntryPaths] = useState<string[]>([]);
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(
    null,
  );
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // Mirror of `renamingPath` for use inside stable callbacks (avoids
  // re-creating `handleRenameCancel` on every rename state change).
  const renamingPathRef = useRef<string | null>(null);
  const [contextTargetPath, setContextTargetPath] = useState<string | null>(
    null,
  );
  const [clipboardItem, setClipboardItem] =
    useState<FileTreeClipboardItem | null>(null);
  const [dragOverDirectoryPath, setDragOverDirectoryPath] = useState<
    string | null
  >(null);

  const entryRowIndexes = useMemo(
    () => rows.flatMap((row, index) => (row.type === 'entry' ? [index] : [])),
    [rows],
  );
  const visibleEntryPaths = useMemo(
    () =>
      rows.flatMap((row) =>
        row.type === 'entry' ? [row.entry.relativePath] : [],
      ),
    [rows],
  );
  const selectedEntryPathSet = useMemo(
    () => new Set(selectedEntryPaths),
    [selectedEntryPaths],
  );
  const entryByRelativePath = useMemo(() => {
    const entries = new Map<string, FileTreeRow & { type: 'entry' }>();
    for (const row of rows) {
      if (row.type === 'entry') entries.set(row.entry.relativePath, row);
    }
    return entries;
  }, [rows]);

  const focusedRowIndex = useMemo(() => {
    const focusedIndex = rows.findIndex(
      (row) =>
        row.type === 'entry' && row.entry.relativePath === focusedEntryPath,
    );
    if (focusedIndex !== -1) return focusedIndex;

    const selectedIndex = rows.findIndex(
      (row) =>
        row.type === 'entry' && row.entry.relativePath === selectedRelativePath,
    );
    if (selectedIndex !== -1) return selectedIndex;

    return entryRowIndexes[0] ?? -1;
  }, [entryRowIndexes, focusedEntryPath, rows, selectedRelativePath]);

  useEffect(() => {
    if (!focusedEntryPath && selectedRelativePath) {
      setFocusedEntryPath(selectedRelativePath);
    }
  }, [focusedEntryPath, selectedRelativePath]);

  const focusRowAtIndex = useCallback(
    (
      index: number,
      options?: { extendSelection?: boolean; suppressPreview?: boolean },
    ) => {
      const row = rows[index];
      if (row?.type !== 'entry') return;

      setFocusedEntryPath(row.entry.relativePath);
      if (options?.extendSelection) {
        const nextSelection = updateFileTreeSelection(
          visibleEntryPaths,
          {
            selectedPaths: selectedEntryPaths,
            anchorPath: selectionAnchorPath,
          },
          row.entry.relativePath,
          'range',
        );
        setSelectedEntryPaths(nextSelection.selectedPaths);
        setSelectionAnchorPath(nextSelection.anchorPath);
        onPreviewTargetChange(null);
      } else if (selectedEntryPaths.length > 0) {
        setSelectedEntryPaths([row.entry.relativePath]);
        setSelectionAnchorPath(row.entry.relativePath);
        onPreviewTargetChange(null);
      } else if (!options?.suppressPreview) {
        handlePreview(
          row.entry.kind === 'directory' ? null : row.entry.relativePath,
        );
      }
      virtuosoRef.current?.scrollToIndex({
        index,
        align: 'center',
        behavior: 'auto',
      });

      const focusVisibleRow = (attempt = 0) => {
        const element = treeRef.current?.querySelector<HTMLButtonElement>(
          `[data-file-tree-row-index="${index}"]`,
        );
        if (element) {
          element.focus();
        } else if (attempt < 6) {
          requestAnimationFrame(() => focusVisibleRow(attempt + 1));
        }
      };
      requestAnimationFrame(() => focusVisibleRow());
    },
    [rows],
  );

  const findTypeaheadMatch = useCallback(
    (query: string) => {
      const normalizedQuery = query.toLowerCase();
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const index of entryRowIndexes) {
        const row = rows[index];
        if (row?.type !== 'entry') continue;

        const name = row.entry.name.toLowerCase();
        const path = row.entry.relativePath.toLowerCase();
        let score = Number.NEGATIVE_INFINITY;

        if (name === normalizedQuery) {
          score = 4000;
        } else if (name.startsWith(normalizedQuery)) {
          score = 3000 - name.length;
        } else {
          const nameIndex = name.indexOf(normalizedQuery);
          const pathIndex = path.indexOf(normalizedQuery);
          if (nameIndex !== -1) {
            score = 2000 - nameIndex * 10 - name.length;
          } else if (pathIndex !== -1) {
            score = 1000 - pathIndex;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      return bestIndex;
    },
    [entryRowIndexes, rows],
  );

  const handleToggle = useCallback(
    (directoryPath: string, expanded: boolean) => {
      if (!workspaceKey) return;
      setDirectoryExpanded(workspaceKey, directoryPath, expanded);
    },
    [setDirectoryExpanded, workspaceKey],
  );

  const restoreFileTreeFocus = useCallback((relativePath: string) => {
    for (const timer of restoreFocusTimersRef.current) {
      window.clearTimeout(timer);
    }
    restoreFocusTimersRef.current = [];

    const restore = () => {
      const tree = treeRef.current;
      if (!tree) return;
      if (tree.contains(document.activeElement)) return;

      const target = Array.from(
        tree.querySelectorAll<HTMLButtonElement>('[data-file-tree-entry-path]'),
      ).find((element) => element.dataset.fileTreeEntryPath === relativePath);
      target?.focus();
    };

    restoreFocusTimersRef.current = [120, 260, 420].map((delay) => {
      const timer = window.setTimeout(() => {
        restoreFocusTimersRef.current = restoreFocusTimersRef.current.filter(
          (scheduledTimer) => scheduledTimer !== timer,
        );
        restore();
      }, delay);
      return timer;
    });
  }, []);

  const handlePreview = useCallback(
    (relativePath: string | null) => {
      onPreviewTargetChange(relativePath);
      if (relativePath) restoreFileTreeFocus(relativePath);
    },
    [onPreviewTargetChange, restoreFileTreeFocus],
  );
  const handleOpen = useCallback(
    (relativePath: string) => {
      if (!workspaceKey || selectedEntryPaths.length > 0) return;
      if (relativePath === activePermanentFileRelativePath) {
        setFocusedEntryPath(relativePath);
        setRenamingPath(relativePath);
        return;
      }
      void openFileTab(workspaceKey, relativePath, openAgent, {
        preview: false,
      }).then((tabId) => {
        if (!tabId) void revealInFolder(workspaceKey, relativePath);
      });
    },
    [
      activePermanentFileRelativePath,
      openAgent,
      openFileTab,
      revealInFolder,
      selectedEntryPaths.length,
      workspaceKey,
    ],
  );

  const handleRenameSubmit = useCallback(
    (relativePath: string, name: string) => {
      if (!workspaceKey) return;
      void renameEntry(workspaceKey, relativePath, name).then((result) => {
        if (!result.success) {
          toast({
            id: `file-tree-rename-error-${Date.now()}`,
            title: 'Rename failed',
            message: result.error ?? 'Could not rename the item.',
            type: 'error',
            actions: [],
          });
          return;
        }
        const nextPath = result.relativePath ?? relativePath;
        setRenamingPath(null);
        setFocusedEntryPath(nextPath);
        // If this was a newly created file, open it in a tab after rename.
        if (openAfterRenameRef.current.delete(relativePath)) {
          void openFileTab(workspaceKey, nextPath, openAgent, {
            preview: false,
          });
        }
      });
    },
    [openAgent, openFileTab, renameEntry, workspaceKey],
  );

  const handleRenameCancel = useCallback(() => {
    const cancelledPath = renamingPathRef.current;
    setRenamingPath(null);
    // If the user cancelled renaming a newly created file, open it with
    // the default name so they can start editing it.
    if (
      cancelledPath &&
      openAfterRenameRef.current.delete(cancelledPath) &&
      workspaceKey
    ) {
      void openFileTab(workspaceKey, cancelledPath, openAgent, {
        preview: false,
      });
    }
  }, [openAgent, openFileTab, workspaceKey]);

  const handleCreateFile = useCallback(
    (directoryPath: string) => {
      if (!workspaceKey) return;
      const activeWorkspaceKey = workspaceKey;
      void createFile(activeWorkspaceKey, directoryPath).then((result) => {
        // If the user switched workspaces while the create was in-flight,
        // discard the result — the path belongs to the old workspace.
        if (workspaceKeyRef.current !== activeWorkspaceKey) return;
        if (!result.success || !result.relativePath) {
          toast({
            id: `file-tree-create-error-${Date.now()}`,
            title: 'New file failed',
            message: result.error ?? 'Could not create a new file.',
            type: 'error',
            actions: [],
          });
          return;
        }
        const newFilePath = result.relativePath;
        // Ensure the parent directory is expanded so the new file is visible.
        void setDirectoryExpanded(workspaceKey, directoryPath, true);
        setFocusedEntryPath(newFilePath);
        setSelectedEntryPaths([]);
        setSelectionAnchorPath(null);
        // Track the new file so the rows-watcher effect scrolls to it and
        // enters rename mode once it appears in the tree. Enqueued (not
        // overwritten) so rapid repeated creates each get their turn.
        pendingNewEntryRef.current.push(newFilePath);
        openAfterRenameRef.current.add(newFilePath);
      });
    },
    [createFile, setDirectoryExpanded, workspaceKey],
  );

  const handleCreateFolder = useCallback(
    (directoryPath: string) => {
      if (!workspaceKey) return;
      const activeWorkspaceKey = workspaceKey;
      void createFolder(activeWorkspaceKey, directoryPath).then((result) => {
        if (workspaceKeyRef.current !== activeWorkspaceKey) return;
        if (!result.success || !result.relativePath) {
          toast({
            id: `file-tree-create-folder-error-${Date.now()}`,
            title: 'New folder failed',
            message: result.error ?? 'Could not create a new folder.',
            type: 'error',
            actions: [],
          });
          return;
        }
        const newFolderPath = result.relativePath;
        void setDirectoryExpanded(workspaceKey, directoryPath, true);
        setFocusedEntryPath(newFolderPath);
        setSelectedEntryPaths([]);
        setSelectionAnchorPath(null);
        pendingNewEntryRef.current.push(newFolderPath);
      });
    },
    [createFolder, setDirectoryExpanded, workspaceKey],
  );

  const getActionPaths = useCallback(
    (relativePath: string) =>
      getEffectiveFileTreeActionPaths(selectedEntryPaths, relativePath),
    [selectedEntryPaths],
  );

  const handleCopy = useCallback(
    (relativePath: string) => {
      if (!workspaceKey) return;
      setClipboardItem({
        workspaceKey,
        relativePaths: getActionPaths(relativePath),
        operation: 'copy',
      });
    },
    [getActionPaths, workspaceKey],
  );

  const handleCut = useCallback(
    (relativePath: string) => {
      if (!workspaceKey) return;
      setClipboardItem({
        workspaceKey,
        relativePaths: getActionPaths(relativePath),
        operation: 'cut',
      });
    },
    [getActionPaths, workspaceKey],
  );

  const handlePaste = useCallback(
    (targetDirectoryPath: string) => {
      if (!workspaceKey || !clipboardItem) return;
      void Promise.all(
        clipboardItem.relativePaths.map((relativePath, index) =>
          pasteEntry(
            clipboardItem.workspaceKey,
            relativePath,
            workspaceKey,
            targetDirectoryPath,
            clipboardItem.operation,
            index === 0 ? undefined : relativePath.split('/').pop(),
          ),
        ),
      ).then((results) => {
        const failed = results.find((result) => !result.success);
        if (failed) {
          toast({
            id: `file-tree-paste-error-${Date.now()}`,
            title: 'Paste failed',
            message: failed.error ?? 'Could not paste the item.',
            type: 'error',
            actions: [],
          });
          return;
        }
        if (clipboardItem.operation === 'cut') setClipboardItem(null);
        void setDirectoryExpanded(workspaceKey, targetDirectoryPath, true);
        const lastResult = results.at(-1);
        if (lastResult?.relativePath)
          setFocusedEntryPath(lastResult.relativePath);
        setSelectedEntryPaths([]);
        setSelectionAnchorPath(null);
      });
    },
    [clipboardItem, pasteEntry, setDirectoryExpanded, workspaceKey],
  );

  const handleMoveDrop = useCallback(
    (targetDirectoryPath: string, event: DragEvent<HTMLElement>) => {
      const payload = parseFileTreeDragPayload(event);
      if (!workspaceKey || !payload) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOverDirectoryPath(null);

      void Promise.all(
        payload.relativePaths.map((relativePath, index) =>
          pasteEntry(
            payload.workspaceKey,
            relativePath,
            workspaceKey,
            targetDirectoryPath,
            'cut',
            index === 0 ? undefined : getFileName(relativePath),
          ),
        ),
      ).then((results) => {
        const failed = results.find((result) => !result.success);
        if (failed) {
          toast({
            id: `file-tree-move-error-${Date.now()}`,
            title: 'Move failed',
            message: failed.error ?? 'Could not move the item.',
            type: 'error',
            actions: [],
          });
          return;
        }
        setClipboardItem(null);
        void setDirectoryExpanded(workspaceKey, targetDirectoryPath, true);
        const lastResult = results.at(-1);
        if (lastResult?.relativePath)
          setFocusedEntryPath(lastResult.relativePath);
      });
    },
    [pasteEntry, setDirectoryExpanded, workspaceKey],
  );

  const handleDelete = useCallback(
    (relativePath: string) => {
      if (!workspaceKey) return;
      const actionPaths = getActionPaths(relativePath);
      const confirmed = window.confirm(
        actionPaths.length === 1
          ? `Delete ${actionPaths[0]}?`
          : `Delete ${actionPaths.length} items?`,
      );
      if (!confirmed) return;
      void Promise.all(
        actionPaths.map((path) => deleteEntry(workspaceKey, path)),
      ).then((results) => {
        const failed = results.find((result) => !result.success);
        if (failed) {
          toast({
            id: `file-tree-delete-error-${Date.now()}`,
            title: 'Delete failed',
            message: failed.error ?? 'Could not delete the item.',
            type: 'error',
            actions: [],
          });
          return;
        }
        if (
          clipboardItem?.relativePaths.some((path) =>
            actionPaths.includes(path),
          )
        ) {
          setClipboardItem(null);
        }
        setFocusedEntryPath(null);
        setSelectedEntryPaths([]);
        setSelectionAnchorPath(null);
        onPreviewTargetChange(null);
      });
    },
    [
      clipboardItem,
      deleteEntry,
      getActionPaths,
      onPreviewTargetChange,
      workspaceKey,
    ],
  );

  const handleReveal = useCallback(
    (relativePath: string) => {
      if (!workspaceKey) return;
      void revealInFolder(workspaceKey, relativePath);
    },
    [revealInFolder, workspaceKey],
  );

  const resolveAbsolutePath = useCallback(
    (relativePath: string): string | null => {
      if (!workspaceMount) return null;
      const normalizedRoot = normalizePath(workspaceMount.path);
      const root =
        normalizedRoot === '/' || /^[A-Za-z]:\/$/.test(normalizedRoot)
          ? normalizedRoot
          : normalizedRoot.replace(/\/+$/, '');
      return relativePath
        ? root.endsWith('/')
          ? `${root}${relativePath}`
          : `${root}/${relativePath}`
        : root;
    },
    [workspaceMount],
  );

  const handleCopyPath = useCallback(
    (relativePath: string) => {
      const absPath = resolveAbsolutePath(relativePath);
      if (!absPath) return;
      void copyText(absPath);
    },
    [copyText, resolveAbsolutePath],
  );

  const handleSelect = useCallback(
    (relativePath: string, event: MouseEvent<HTMLButtonElement>) => {
      const row = rows.find(
        (candidate) =>
          candidate.type === 'entry' &&
          candidate.entry.relativePath === relativePath,
      );
      if (row?.type !== 'entry') return;

      setFocusedEntryPath(relativePath);
      const implicitAnchorPath = selectionAnchorPath ?? focusedEntryPath;
      const baseSelection =
        selectedEntryPaths.length === 0 &&
        implicitAnchorPath &&
        implicitAnchorPath !== relativePath
          ? {
              selectedPaths: [implicitAnchorPath],
              anchorPath: implicitAnchorPath,
            }
          : {
              selectedPaths: selectedEntryPaths,
              anchorPath: selectionAnchorPath,
            };
      const interaction = event.shiftKey
        ? 'range'
        : isSelectionModifierPressed(event)
          ? 'toggle'
          : selectedEntryPaths.length > 1
            ? 'replace'
            : null;

      if (interaction) {
        const nextSelection = updateFileTreeSelection(
          visibleEntryPaths,
          baseSelection,
          relativePath,
          interaction,
        );
        setSelectedEntryPaths(nextSelection.selectedPaths);
        setSelectionAnchorPath(nextSelection.anchorPath);
        onPreviewTargetChange(null);
        return;
      }

      setSelectionAnchorPath(relativePath);
      if (row.entry.kind === 'directory')
        handleToggle(relativePath, !row.expanded);
      else handlePreview(relativePath);
    },
    [
      handlePreview,
      handleToggle,
      onPreviewTargetChange,
      rows,
      focusedEntryPath,
      selectedEntryPaths,
      selectionAnchorPath,
      visibleEntryPaths,
    ],
  );

  // Collapse an active multi-selection as soon as the user presses (mouse
  // down) on a row without a group-selection modifier and outside the current
  // selection. Pressing inside the selection is preserved so a group can still
  // be dragged; range/toggle (shift / cmd|ctrl) are left to the click handler.
  const handleSelectPointerDown = useCallback(
    (relativePath: string, event: MouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (event.shiftKey || isSelectionModifierPressed(event)) return;
      if (selectedEntryPaths.length === 0) return;
      if (selectedEntryPaths.includes(relativePath)) return;
      setSelectedEntryPaths([]);
      setSelectionAnchorPath(relativePath);
      setFocusedEntryPath(relativePath);
    },
    [selectedEntryPaths],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const modifierPressed = event.ctrlKey || event.metaKey;
      if (event.altKey) return;
      if (!isFileTreeEntryKeyTarget(event.target, treeRef.current)) return;
      if (entryRowIndexes.length === 0) return;

      const firstEntryIndex = entryRowIndexes[0];
      if (firstEntryIndex === undefined) return;

      const currentIndex =
        focusedRowIndex === -1 ? firstEntryIndex : focusedRowIndex;
      const currentPosition = Math.max(
        0,
        entryRowIndexes.indexOf(currentIndex),
      );

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex =
          entryRowIndexes[
            Math.min(currentPosition + 1, entryRowIndexes.length - 1)
          ] ?? currentIndex;
        focusRowAtIndex(nextIndex, { extendSelection: event.shiftKey });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex =
          entryRowIndexes[Math.max(currentPosition - 1, 0)] ?? currentIndex;
        focusRowAtIndex(nextIndex, { extendSelection: event.shiftKey });
        return;
      }

      const currentRow = rows[currentIndex];
      if (currentRow?.type === 'entry') {
        if (event.key === 'Escape' && selectedEntryPaths.length > 0) {
          event.preventDefault();
          setSelectedEntryPaths([]);
          setSelectionAnchorPath(null);
          return;
        }

        if (modifierPressed && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          const nextSelection = selectAllFileTreeEntries(visibleEntryPaths);
          setSelectedEntryPaths(nextSelection.selectedPaths);
          setSelectionAnchorPath(nextSelection.anchorPath);
          onPreviewTargetChange(null);
          return;
        }

        if (modifierPressed && event.key.toLowerCase() === 'c') {
          event.preventDefault();
          handleCopy(currentRow.entry.relativePath);
          return;
        }

        if (modifierPressed && event.key.toLowerCase() === 'x') {
          event.preventDefault();
          handleCut(currentRow.entry.relativePath);
          return;
        }

        if (modifierPressed && event.key.toLowerCase() === 'v') {
          event.preventDefault();
          handlePaste(
            currentRow.entry.kind === 'directory'
              ? currentRow.entry.relativePath
              : getParentDirectory(currentRow.entry.relativePath),
          );
          return;
        }

        if (event.key === 'F2') {
          event.preventDefault();
          if (getActionPaths(currentRow.entry.relativePath).length === 1) {
            setRenamingPath(currentRow.entry.relativePath);
          }
          return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          handleDelete(currentRow.entry.relativePath);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          if (selectedEntryPaths.length > 0) return;
          if (currentRow.entry.kind === 'directory') {
            handleToggle(currentRow.entry.relativePath, !currentRow.expanded);
          } else {
            handleOpen(currentRow.entry.relativePath);
          }
          return;
        }

        if (
          event.key === 'ArrowRight' &&
          currentRow.entry.kind === 'directory'
        ) {
          event.preventDefault();
          if (!currentRow.expanded) {
            handleToggle(currentRow.entry.relativePath, true);
          }
          return;
        }

        if (
          event.key === 'ArrowLeft' &&
          currentRow.entry.kind === 'directory'
        ) {
          event.preventDefault();
          if (currentRow.expanded) {
            handleToggle(currentRow.entry.relativePath, false);
          }
          return;
        }
      }

      if (
        modifierPressed ||
        event.key.length !== 1 ||
        event.key.trim() === ''
      ) {
        return;
      }

      event.preventDefault();
      const nextValue =
        `${typeaheadRef.current.value}${event.key}`.toLowerCase();
      typeaheadRef.current.value = nextValue;
      if (typeaheadRef.current.timer !== null) {
        window.clearTimeout(typeaheadRef.current.timer);
      }
      typeaheadRef.current.timer = window.setTimeout(() => {
        typeaheadRef.current.value = '';
        typeaheadRef.current.timer = null;
      }, 700);

      const matchIndex = findTypeaheadMatch(nextValue);
      if (matchIndex !== -1) {
        focusRowAtIndex(matchIndex);
      }
    },
    [
      entryRowIndexes,
      findTypeaheadMatch,
      focusRowAtIndex,
      focusedRowIndex,
      handleCopy,
      handleCut,
      getActionPaths,
      handleDelete,
      handleOpen,
      handlePaste,
      handleToggle,
      onPreviewTargetChange,
      rows,
      selectedEntryPaths.length,
      visibleEntryPaths,
    ],
  );

  useEffect(() => {
    return () => {
      for (const timer of restoreFocusTimersRef.current) {
        window.clearTimeout(timer);
      }
      restoreFocusTimersRef.current = [];
    };
  }, []);

  // When new entries are created, wait for them to appear in the tree rows,
  // scroll to each in turn, and enter rename mode. Only one rename is
  // active at a time; the rest wait in the queue until the current
  // rename is submitted or cancelled (which sets renamingPath back to
  // null, re-running this effect).
  useEffect(() => {
    if (renamingPath !== null) return;
    const queue = pendingNewEntryRef.current;
    const pendingPath = queue.shift();
    if (pendingPath === undefined) return;
    const index = rows.findIndex(
      (row) => row.type === 'entry' && row.entry.relativePath === pendingPath,
    );
    if (index === -1) {
      // Not visible yet. If the parent directory is paginated, trigger
      // a load-more to fetch the next page so the file eventually appears
      // in the loaded rows. Otherwise (directory loaded but file missing —
      // e.g. tree collapsed) re-queue and wait for the next row change.
      const parentDir = getParentDirectory(pendingPath);
      const loadMoreRow = rows.find(
        (row) => row.type === 'load-more' && row.directoryPath === parentDir,
      );
      if (loadMoreRow && loadMoreRow.type === 'load-more') {
        loadMoreRef.current(parentDir);
      }
      queue.unshift(pendingPath);
      return;
    }
    virtuosoRef.current?.scrollToIndex({
      index,
      align: 'center',
      behavior: 'auto',
    });
    setRenamingPath(pendingPath);
  }, [rows, renamingPath]);

  // Keep `renamingPathRef` in sync so `handleRenameCancel` can read the
  // current value without depending on `renamingPath` state.
  useEffect(() => {
    renamingPathRef.current = renamingPath;
  }, [renamingPath]);

  const handleTreeContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const element = (
        event.target as HTMLElement | null
      )?.closest<HTMLElement>('[data-file-tree-entry-path]');
      const path = element?.dataset.fileTreeEntryPath ?? null;
      setContextTargetPath(path);
      if (path) setFocusedEntryPath(path);
    },
    [],
  );

  if (!workspaceKey) {
    return (
      <div className="flex size-full items-center justify-center px-3 text-center text-muted-foreground text-xs">
        No mounted workspaces.
      </div>
    );
  }

  const contextEntry = contextTargetPath
    ? (entryByRelativePath.get(contextTargetPath)?.entry ?? null)
    : null;
  const contextIsDirectory = contextEntry?.kind === 'directory';
  const contextCanRename =
    contextTargetPath != null && getActionPaths(contextTargetPath).length === 1;
  const contextPasteDirectory = !contextTargetPath
    ? ''
    : contextIsDirectory
      ? contextTargetPath
      : getParentDirectory(contextTargetPath);
  // The directory where a new entry would be created — the targeted directory
  // itself, the parent of a targeted file, or the workspace root for
  // empty-space right-clicks.
  const contextCreateDirectory = contextPasteDirectory;
  const workspaceIsReadOnly = workspaceKey
    ? isReadOnlyWorkspaceKey(workspaceKey)
    : false;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <div
            ref={treeRef}
            className="size-full"
            onKeyDown={handleKeyDown}
            onContextMenuCapture={handleTreeContextMenu}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(FILE_TREE_MOVE_MIME))
                return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOverDirectoryPath('');
            }}
            onDrop={(event) => handleMoveDrop('', event)}
            role="tree"
          />
        }
      >
        <Virtuoso
          ref={virtuosoRef}
          className="scrollbar-subtle size-full py-0.5"
          data={rows}
          computeItemKey={(_, row) => row.id}
          itemContent={(index, row) => (
            <FileTreeRowView
              row={row}
              selected={
                row.type === 'entry' &&
                (selectedEntryPathSet.has(row.entry.relativePath) ||
                  (selectedEntryPaths.length === 0 &&
                    row.entry.relativePath === shownRelativePath))
              }
              focused={index === focusedRowIndex}
              rowIndex={index}
              dragPath={
                row.type === 'entry'
                  ? `${workspaceKey}/${row.entry.relativePath}`
                  : ''
              }
              dragPayload={
                row.type === 'entry'
                  ? JSON.stringify({
                      workspaceKey,
                      relativePaths: getActionPaths(row.entry.relativePath),
                    } satisfies FileTreeDragPayload)
                  : ''
              }
              dragFilePaths={
                row.type === 'entry'
                  ? getActionPaths(row.entry.relativePath).map(
                      (relativePath) => `${workspaceKey}/${relativePath}`,
                    )
                  : EMPTY_DRAG_FILE_PATHS
              }
              onFocus={() => {
                if (
                  row.type === 'entry' &&
                  focusedEntryPath !== row.entry.relativePath
                ) {
                  setFocusedEntryPath(row.entry.relativePath);
                }
              }}
              onToggle={handleToggle}
              onSelect={(event) => {
                if (row.type === 'entry')
                  handleSelect(row.entry.relativePath, event);
              }}
              onSelectPointerDown={(event) => {
                if (row.type === 'entry')
                  handleSelectPointerDown(row.entry.relativePath, event);
              }}
              cut={
                row.type === 'entry' &&
                clipboardItem?.operation === 'cut' &&
                clipboardItem.relativePaths.includes(row.entry.relativePath)
              }
              dropTarget={
                row.type === 'entry' &&
                row.entry.kind === 'directory' &&
                dragOverDirectoryPath === row.entry.relativePath
              }
              renaming={
                row.type === 'entry' && row.entry.relativePath === renamingPath
              }
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={handleRenameCancel}
              onOpen={handleOpen}
              onMoveDrop={handleMoveDrop}
              onDragTargetChange={setDragOverDirectoryPath}
              onLoadMore={loadMore}
            />
          )}
        />
      </ContextMenu.Trigger>
      <MenuBase.Portal>
        <MenuBase.Positioner className="z-50" sideOffset={4} align="start">
          <MenuBase.Popup
            className={cn(
              'flex min-w-40 origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-border-subtle bg-background p-1',
              'text-xs shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={workspaceIsReadOnly}
              onClick={() => handleCreateFile(contextCreateDirectory)}
            >
              <FilePlusIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">New File</span>
            </MenuBase.Item>
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={workspaceIsReadOnly}
              onClick={() => handleCreateFolder(contextCreateDirectory)}
            >
              <FolderPlusIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">New Folder</span>
            </MenuBase.Item>
            <MenuBase.Separator className="my-0.5 h-px bg-border-subtle" />
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={!contextCanRename}
              onClick={() => {
                if (!contextTargetPath) return;
                setFocusedEntryPath(contextTargetPath);
                setRenamingPath(contextTargetPath);
              }}
            >
              <PencilIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Rename</span>
              <ShortcutCombo
                value="F2"
                size="xs"
                variant="subtle"
                className="shrink-0"
              />
            </MenuBase.Item>
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={!contextTargetPath}
              onClick={() => {
                if (contextTargetPath) handleCopy(contextTargetPath);
              }}
            >
              <CopyIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Copy</span>
              <ShortcutCombo
                value={contextMenuShortcut('C')}
                size="xs"
                variant="subtle"
                className="shrink-0"
              />
            </MenuBase.Item>
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={!contextTargetPath}
              onClick={() => {
                if (contextTargetPath) handleCut(contextTargetPath);
              }}
            >
              <ScissorsIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Cut</span>
              <ShortcutCombo
                value={contextMenuShortcut('X')}
                size="xs"
                variant="subtle"
                className="shrink-0"
              />
            </MenuBase.Item>
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={clipboardItem === null}
              onClick={() => handlePaste(contextPasteDirectory)}
            >
              <ClipboardPasteIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Paste</span>
              <ShortcutCombo
                value={contextMenuShortcut('V')}
                size="xs"
                variant="subtle"
                className="shrink-0"
              />
            </MenuBase.Item>
            <MenuBase.Item
              className={cn(contextMenuItemClassName, 'text-error-foreground')}
              disabled={!contextTargetPath}
              onClick={() => {
                if (contextTargetPath) handleDelete(contextTargetPath);
              }}
            >
              <Trash2Icon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Delete</span>
              <ShortcutCombo
                value="Delete"
                size="xs"
                variant="subtle"
                className="shrink-0"
              />
            </MenuBase.Item>
            <MenuBase.Separator className="my-0.5 h-px bg-border-subtle" />
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={!contextTargetPath}
              onClick={() => {
                if (contextTargetPath) handleCopyPath(contextTargetPath);
              }}
            >
              <ClipboardIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Copy path</span>
            </MenuBase.Item>
            <MenuBase.Separator className="my-0.5 h-px bg-border-subtle" />
            <MenuBase.Item
              className={contextMenuItemClassName}
              disabled={!contextTargetPath}
              onClick={() => {
                if (contextTargetPath) handleReveal(contextTargetPath);
              }}
            >
              <FolderOpenIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Open in {nativeFileManagerLabel}
              </span>
            </MenuBase.Item>
          </MenuBase.Popup>
        </MenuBase.Positioner>
      </MenuBase.Portal>
    </ContextMenu.Root>
  );
}

type FileTreeRowViewProps = {
  row: FileTreeRow;
  selected: boolean;
  focused: boolean;
  rowIndex: number;
  dragPath: string;
  dragPayload: string;
  dragFilePaths: string[];
  cut: boolean;
  dropTarget: boolean;
  renaming: boolean;
  onFocus: () => void;
  onToggle: (directoryPath: string, expanded: boolean) => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onSelectPointerDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpen: (relativePath: string) => void;
  onRenameSubmit: (relativePath: string, name: string) => void;
  onRenameCancel: () => void;
  onMoveDrop: (
    targetDirectoryPath: string,
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragTargetChange: (directoryPath: string | null) => void;
  onLoadMore: (directoryPath: string) => void;
};

export const FileTreeRowView = memo(function FileTreeRowView({
  row,
  selected,
  focused,
  rowIndex,
  dragPath,
  dragPayload,
  dragFilePaths,
  cut,
  dropTarget,
  renaming,
  onFocus,
  onToggle,
  onSelect,
  onSelectPointerDown,
  onOpen,
  onRenameSubmit,
  onRenameCancel,
  onMoveDrop,
  onDragTargetChange,
  onLoadMore,
}: FileTreeRowViewProps) {
  if (row.type === 'loading') {
    return (
      <div
        className="mb-px flex h-6 items-center gap-1 px-1 text-muted-foreground text-xs"
        style={{ paddingLeft: 8 + row.depth * 14 }}
      >
        <Loader2Icon className="size-3 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (row.type === 'error') {
    return (
      <div
        className="mb-px truncate px-2 py-1 text-error-foreground text-xs"
        style={{ paddingLeft: 8 + row.depth * 14 }}
      >
        {row.message}
      </div>
    );
  }

  if (row.type === 'load-more') {
    return (
      <Button
        variant="ghost"
        size="xs"
        className="my-0.5 justify-start text-muted-foreground"
        style={{ marginLeft: 4 + row.depth * 14 }}
        onClick={() => onLoadMore(row.directoryPath)}
      >
        Load more
      </Button>
    );
  }

  return (
    <div
      className={
        selected ? 'mx-1 mb-px rounded bg-active-derived' : 'mx-1 mb-px'
      }
    >
      <FileTreeNode
        entry={row.entry}
        depth={row.depth}
        expanded={row.expanded}
        loading={row.loading}
        focused={focused}
        rowIndex={rowIndex}
        dragPath={dragPath}
        dragPayload={dragPayload}
        dragFilePaths={dragFilePaths}
        selected={selected}
        cut={cut}
        dropTarget={dropTarget}
        renaming={renaming}
        onFocus={onFocus}
        onToggle={() => onToggle(row.entry.relativePath, !row.expanded)}
        onSelect={onSelect}
        onSelectPointerDown={onSelectPointerDown}
        onOpen={() => onOpen(row.entry.relativePath)}
        onDragEnter={() =>
          onDragTargetChange(
            row.entry.kind === 'directory'
              ? row.entry.relativePath
              : getParentDirectory(row.entry.relativePath),
          )
        }
        onDragLeave={() => onDragTargetChange(null)}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(FILE_TREE_MOVE_MIME)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          onDragTargetChange(
            row.entry.kind === 'directory'
              ? row.entry.relativePath
              : getParentDirectory(row.entry.relativePath),
          );
        }}
        onDrop={(event) =>
          onMoveDrop(
            row.entry.kind === 'directory'
              ? row.entry.relativePath
              : getParentDirectory(row.entry.relativePath),
            event,
          )
        }
        onRenameSubmit={(name) => onRenameSubmit(row.entry.relativePath, name)}
        onRenameCancel={onRenameCancel}
      />
    </div>
  );
});
