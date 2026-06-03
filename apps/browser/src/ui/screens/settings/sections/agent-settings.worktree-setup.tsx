import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverTitle,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { toast } from '@stagewise/stage-ui/components/toaster';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import type {
  KartonContract,
  WorktreeSetupManagedWorktree,
  WorktreeSetupRepositorySettings,
} from '@shared/karton-contracts/ui';
import {
  IconBranchOutOutline18,
  IconCircleQuestionOutline18,
  IconTrashOutline18,
} from 'nucleo-ui-outline-18';
import { FileIcon } from '@ui/components/file-icon';
import { FileContextMenu } from '@ui/components/file-context-menu';

const SETUP_SCRIPT_TEMPLATE = `#!/bin/sh
set -e

# Runs after stagewise creates and mounts a new Git worktree.
# CWD is the new worktree.

# Example:
# pnpm install
`;

function getInitialScriptDraft(
  repository: WorktreeSetupRepositorySettings,
): string {
  return repository.scriptExists
    ? repository.scriptContent
    : SETUP_SCRIPT_TEMPLATE;
}

function formatRelativeTime(timestamp: number | null): string {
  if (timestamp === null) return 'Never used';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function WorktreeSetupSection() {
  const listRepositories = useKartonProcedure(
    (p: KartonContract['serverProcedures']) =>
      p.toolbox.listWorktreeSetupRepositories,
  );
  const saveScript = useKartonProcedure(
    (p: KartonContract['serverProcedures']) =>
      p.toolbox.saveWorktreeSetupScript,
  );
  const deleteWorktree = useKartonProcedure(
    (p: KartonContract['serverProcedures']) =>
      p.toolbox.deleteWorktreeSetupWorktree,
  );
  const listRepositoriesRef = useRef(listRepositories);
  listRepositoriesRef.current = listRepositories;
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const [repositories, setRepositories] = useState<
    WorktreeSetupRepositorySettings[]
  >([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<
    string | null
  >(null);
  const [scriptDraft, setScriptDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const previousSelectedRepositoryIdRef = useRef<string | null>(null);

  const selectedRepository = useMemo(
    () =>
      repositories.find(
        (repository) => repository.id === selectedRepositoryId,
      ) ??
      repositories[0] ??
      null,
    [repositories, selectedRepositoryId],
  );

  const dirty =
    selectedRepository !== null &&
    scriptDraft !== getInitialScriptDraft(selectedRepository);

  const refreshRepositories = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      if (mountedRef.current) setLoading(true);
      try {
        const result = await listRepositoriesRef.current();

        if (!mountedRef.current) return;
        setRepositories(result.repositories);
        setSelectedRepositoryId((current) => {
          if (
            current &&
            result.repositories.some(
              (repo: WorktreeSetupRepositorySettings) => repo.id === current,
            )
          ) {
            return current;
          }
          return result.repositories[0]?.id ?? null;
        });
      } finally {
        refreshInFlightRef.current = null;
        if (mountedRef.current) setLoading(false);
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, []);

  useEffect(() => {
    void refreshRepositories();
  }, [refreshRepositories]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const selectedRepositoryId = selectedRepository?.id ?? null;
    if (previousSelectedRepositoryIdRef.current === selectedRepositoryId) {
      return;
    }

    previousSelectedRepositoryIdRef.current = selectedRepositoryId;
    setScriptDraft(
      selectedRepository ? getInitialScriptDraft(selectedRepository) : '',
    );
  }, [selectedRepository]);

  const updateRepository = useCallback(
    (repository: WorktreeSetupRepositorySettings) => {
      setRepositories((current) => {
        const index = current.findIndex((item) => item.id === repository.id);
        if (index === -1) return current;
        const next = [...current];
        next[index] = repository;
        return next;
      });
      setSelectedRepositoryId(repository.id);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!selectedRepository) return;
    setSaving(true);
    try {
      const result = await saveScript(
        selectedRepository.mainWorktreePath,
        scriptDraft,
      );
      if (result.ok) {
        updateRepository(result.repository);
        toast({
          id: `worktree-setup-save-${Date.now()}`,
          title: 'Worktree setup script saved',
          message: 'Your setup script was updated.',
          type: 'info',
          actions: [],
        });
      } else {
        toast({
          id: `worktree-setup-save-error-${Date.now()}`,
          title: 'Failed to save setup script',
          message: result.message,
          type: 'error',
          actions: [],
        });
      }
    } finally {
      setSaving(false);
    }
  }, [saveScript, scriptDraft, selectedRepository, updateRepository]);

  const handleReset = useCallback(() => {
    if (!selectedRepository) return;
    setScriptDraft(getInitialScriptDraft(selectedRepository));
  }, [selectedRepository]);

  const handleConfirmDelete = useCallback(
    async (worktree: WorktreeSetupManagedWorktree) => {
      setDeletingPath(worktree.path);
      try {
        const result = await deleteWorktree(worktree.path);
        if (result.ok) {
          if (result.repository) updateRepository(result.repository);
          else await refreshRepositories();
          toast({
            id: `worktree-delete-${Date.now()}`,
            title: 'Worktree deleted',
            message: 'The local worktree checkout was removed.',
            type: 'info',
            actions: [],
          });
          return true;
        }

        toast({
          id: `worktree-delete-error-${Date.now()}`,
          title: 'Failed to delete worktree',
          message: result.message,
          type: 'error',
          actions: [],
        });
        return false;
      } finally {
        setDeletingPath(null);
      }
    },
    [deleteWorktree, refreshRepositories, updateRepository],
  );

  return (
    <div className="h-full w-full">
      {/* Content */}
      <OverlayScrollbar className="h-full" contentClassName="px-6 pt-24 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Header */}
          <div>
            <h1 className="font-semibold text-foreground text-xl">Worktrees</h1>
            <p className="text-muted-foreground text-sm">
              Configure scripts and clean stagewise-managed Git worktrees.
            </p>
          </div>

          <RepositoryList
            repositories={repositories}
            selectedRepositoryId={selectedRepository?.id ?? null}
            onSelect={setSelectedRepositoryId}
          />

          <section className="min-w-0">
            {selectedRepository ? (
              <RepositoryDetails
                repository={selectedRepository}
                scriptDraft={scriptDraft}
                dirty={dirty}
                saving={saving}
                deletingPath={deletingPath}
                onScriptDraftChange={setScriptDraft}
                onReset={handleReset}
                onSave={handleSave}
                onConfirmDelete={handleConfirmDelete}
              />
            ) : (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-derived-subtle">
                <p className="text-muted-foreground text-sm">
                  {loading
                    ? 'Loading repositories...'
                    : 'No known Git repositories yet. Connect a Git workspace once to configure worktree setup here.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}

function RepositoryList({
  repositories,
  selectedRepositoryId,
  onSelect,
}: {
  repositories: WorktreeSetupRepositorySettings[];
  selectedRepositoryId: string | null;
  onSelect: (id: string) => void;
}) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  viewportRef.current = viewport;
  const { maskStyle } = useScrollFadeMask(viewportRef, {
    axis: 'horizontal',
    fadeDistance: 24,
  });

  return (
    <OverlayScrollbar
      className="scrollbar-subtle mask-alpha max-w-full"
      style={maskStyle}
      options={{ overflow: { x: 'scroll', y: 'hidden' } }}
      onViewportRef={setViewport}
      contentClassName="flex gap-2"
    >
      <nav className="flex gap-2">
        {repositories.map((repository) => {
          const selected = selectedRepositoryId === repository.id;
          const worktreeCount = repository.managedWorktrees.length;
          return (
            <button
              key={repository.id}
              type="button"
              onClick={() => onSelect(repository.id)}
              className={cn(
                buttonVariants({
                  variant: 'ghost',
                }),
                'h-auto shrink-0 flex-col items-start px-3 py-2 text-left first:pl-0',
                selected && 'font-medium text-foreground',
              )}
            >
              <span className="block truncate text-sm">{repository.name}</span>
              <span
                className={cn(
                  'block truncate text-xs',
                  selected
                    ? 'text-muted-foreground group-hover/button:text-foreground group-focus-visible/button:text-foreground'
                    : 'text-subtle-foreground group-hover/button:text-muted-foreground group-focus-visible/button:text-muted-foreground',
                )}
              >
                {worktreeCount} {worktreeCount === 1 ? 'worktree' : 'worktrees'}{' '}
                used
              </span>
            </button>
          );
        })}
      </nav>
    </OverlayScrollbar>
  );
}

function RepositoryDetails({
  repository,
  scriptDraft,
  dirty,
  saving,
  deletingPath,
  onScriptDraftChange,
  onReset,
  onSave,
  onConfirmDelete,
}: {
  repository: WorktreeSetupRepositorySettings;
  scriptDraft: string;
  dirty: boolean;
  saving: boolean;
  deletingPath: string | null;
  onScriptDraftChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
  onConfirmDelete: (worktree: WorktreeSetupManagedWorktree) => Promise<boolean>;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground text-sm">Script</h3>
            <SetupVariablesPopover />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              Runs for new worktrees when the checked-out branch contains this
              file.
            </p>
            <FileContextMenu
              relativePath={repository.scriptPath}
              resolvePath={(p) => p}
            >
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'xs' }),
                      'h-auto px-1 py-0.5',
                    )}
                  >
                    <FileIcon
                      filePath={repository.scriptPath}
                      className="size-4 shrink-0"
                    />
                    <span>worktree-setup.sh</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{repository.scriptPath}</TooltipContent>
              </Tooltip>
            </FileContextMenu>
          </div>
        </div>
        <textarea
          value={scriptDraft}
          onChange={(event) => onScriptDraftChange(event.target.value)}
          spellCheck={false}
          className="scrollbar-subtle min-h-72 w-full resize-y rounded-lg border border-derived bg-surface-1 p-3 font-mono text-foreground text-xs outline-none ring-0 transition-colors placeholder:text-subtle-foreground focus:border-derived-strong"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={!dirty}>
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => void onSave()}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </section>

      <ManagedWorktreeList
        worktrees={repository.managedWorktrees}
        deletingPath={deletingPath}
        onConfirmDelete={onConfirmDelete}
      />
    </div>
  );
}

function SetupVariablesPopover() {
  return (
    <Popover>
      <PopoverTrigger>
        <button
          type="button"
          className="group/button relative box-border flex h-5 cursor-pointer flex-row items-center justify-center gap-1 rounded-md bg-transparent px-1.5 py-1 font-normal text-subtle-foreground text-xs outline-none transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary-solid/40 active:text-muted-foreground"
          aria-label="Show setup script environment variables"
        >
          <span>Available variables</span>
          <IconCircleQuestionOutline18 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 gap-4 p-3">
        <PopoverTitle>Setup script environment variables</PopoverTitle>
        <PopoverDescription>
          These path variables are available when the worktree setup script
          runs.
        </PopoverDescription>
        <PopoverClose />
        <div className="space-y-3">
          <SetupVariableItem
            label="Source worktree path"
            value="STAGEWISE_SOURCE_WORKTREE_PATH"
          />
          <SetupVariableItem
            label="Target worktree path"
            value="STAGEWISE_TARGET_WORKTREE_PATH"
          />
          <SetupVariableItem
            label="Main worktree path"
            value="STAGEWISE_MAIN_WORKTREE_PATH"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SetupVariableItem({ label, value }: { label: string; value: string }) {
  const [hasCopied, setHasCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(value);
    setHasCopied(true);
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = setTimeout(() => setHasCopied(false), 2000);
  }, [value]);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="group/variable flex w-full cursor-pointer items-center gap-2 rounded-md border border-derived-subtle bg-surface-1 px-2 py-1.5 text-left font-mono text-foreground text-xs outline-none transition-colors hover:bg-hover-derived focus-visible:ring-2 focus-visible:ring-primary-solid/40"
        aria-label={`Copy ${value}`}
      >
        <code className="min-w-0 flex-1 truncate">{value}</code>
        {hasCopied ? (
          <CheckIcon className="size-3 shrink-0 text-foreground" />
        ) : (
          <CopyIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/variable:opacity-100 group-focus-visible/variable:opacity-100" />
        )}
      </button>
    </div>
  );
}

function ManagedWorktreeList({
  worktrees,
  deletingPath,
  onConfirmDelete,
}: {
  worktrees: WorktreeSetupManagedWorktree[];
  deletingPath: string | null;
  onConfirmDelete: (worktree: WorktreeSetupManagedWorktree) => Promise<boolean>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  viewportRef.current = viewport;
  const { maskStyle } = useScrollFadeMask(viewportRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  const filteredWorktrees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return worktrees;

    return worktrees.filter((worktree) =>
      [
        worktree.name,
        worktree.path,
        worktree.branch ?? '',
        worktree.headSha ?? '',
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchQuery, worktrees]);

  const noResults =
    searchQuery.trim().length > 0 && filteredWorktrees.length === 0;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-medium text-foreground text-sm">
          Managed worktrees
        </h3>
        <p className="text-muted-foreground text-xs">
          Stagewise-controlled worktree instances for this repository.
        </p>
      </div>

      {worktrees.length > 0 ? (
        <Input
          placeholder="Filter worktrees..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          size="sm"
          className="flex-1"
          style={{ maxWidth: 'none' }}
        />
      ) : null}

      {worktrees.length === 0 ? (
        <div className="rounded-lg border border-derived-subtle p-4">
          <p className="text-center text-muted-foreground text-sm">
            No stagewise-managed worktrees for this repository.
          </p>
        </div>
      ) : (
        <OverlayScrollbar
          className="mask-alpha max-h-80"
          style={maskStyle}
          onViewportRef={setViewport}
          contentClassName="space-y-2"
        >
          {filteredWorktrees.map((worktree) => (
            <WorktreeRow
              key={worktree.path}
              worktree={worktree}
              deleting={deletingPath === worktree.path}
              onConfirmDelete={onConfirmDelete}
            />
          ))}

          {noResults ? (
            <div className="rounded-lg border border-derived-subtle p-4">
              <p className="text-center text-muted-foreground text-sm">
                No worktrees match your filter.
              </p>
            </div>
          ) : null}
        </OverlayScrollbar>
      )}
    </section>
  );
}

function WorktreeRow({
  worktree,
  deleting,
  onConfirmDelete,
}: {
  worktree: WorktreeSetupManagedWorktree;
  deleting: boolean;
  onConfirmDelete: (worktree: WorktreeSetupManagedWorktree) => Promise<boolean>;
}) {
  const [deletePopoverOpen, setDeletePopoverOpen] = useState(false);
  const timeAgo = formatRelativeTime(worktree.lastUsedAt);

  const deleteButtonClassName =
    'absolute right-3 flex size-5 cursor-pointer items-center justify-center text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-solid/40 disabled:cursor-not-allowed disabled:opacity-0 group-focus-within/worktree:opacity-100 group-hover/worktree:opacity-100 disabled:group-hover/worktree:opacity-40';

  const deleteButton = (
    <button
      type="button"
      disabled={!worktree.removable || deleting}
      aria-label={`Delete ${worktree.name}`}
      className={deleteButtonClassName}
    >
      <IconTrashOutline18 className="size-3.5" />
    </button>
  );

  return (
    <div className="group/worktree relative flex items-center gap-3 rounded-lg border border-derived bg-surface-1 p-3 pr-10">
      <IconBranchOutOutline18 className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h4 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
          <span className="truncate text-foreground">{worktree.name}</span>
          <span className="shrink-0 text-subtle-foreground text-xs">
            {timeAgo}
          </span>
        </h4>
        <p className="truncate text-muted-foreground text-xs">
          {worktree.path}
        </p>
      </div>
      {worktree.removable ? (
        <Popover open={deletePopoverOpen} onOpenChange={setDeletePopoverOpen}>
          <PopoverTrigger>{deleteButton}</PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-72">
            <PopoverTitle>Delete worktree?</PopoverTitle>
            <PopoverDescription>
              This removes the local worktree checkout. It does not delete the
              branch.
            </PopoverDescription>
            <PopoverClose />
            <PopoverFooter>
              <Button
                variant="primary"
                size="xs"
                disabled={deleting}
                onClick={async () => {
                  const deleted = await onConfirmDelete(worktree);
                  if (deleted) setDeletePopoverOpen(false);
                }}
                autoFocus
              >
                {deleting ? 'Deleting...' : 'Delete worktree'}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={deleting}
                onClick={() => setDeletePopoverOpen(false)}
              >
                Cancel
              </Button>
            </PopoverFooter>
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              className={cn(
                deleteButtonClassName,
                'cursor-not-allowed group-hover/worktree:opacity-40',
              )}
              aria-disabled="true"
              aria-label={`Cannot delete ${worktree.name}`}
              onClick={(event) => event.preventDefault()}
            >
              <IconTrashOutline18 className="size-3.5" />
            </button>
          </TooltipTrigger>
          {worktree.disabledReason ? (
            <TooltipContent>{worktree.disabledReason}</TooltipContent>
          ) : null}
        </Tooltip>
      )}
    </div>
  );
}
