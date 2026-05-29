import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { enablePatches, type Patch } from 'immer';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useAgentSwitcher, useOpenAgent } from '@ui/hooks/use-open-chat';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import type { AgentHistoryEntry } from '@shared/karton-contracts/ui/agent';
import {
  activeAgentCardsEqual,
  buildWorkspaceAgentGroups,
  getAgentStateSeverity,
  getSeverityDotClass,
  maxSeverity,
  mergeAgentEntries,
  type ActiveAgentCardData,
  type MergedAgentEntry,
  type WorkspaceGroupOrder,
  type WorkspaceRepoGroup,
  type WorkspaceWorktreeGroup,
} from '../../_lib/agent-list-model';
import {
  AGENT_TITLE_RENAMED_EVENT,
  dispatchAgentTitleRenamed,
  isAgentTitleRenamedEvent,
} from '../../_lib/agent-title-renamed-event';
import {
  AGENT_DELETED_EVENT,
  dispatchAgentDeleted,
  isAgentDeletedEvent,
} from '../../_lib/agent-deleted-event';
import {
  EMPTY_MOUNTS,
  type WorkspaceGitWorktreeDeletionInfo,
  type WorkspaceGitWorktreesResult,
} from '@shared/karton-contracts/ui';
import type {
  AgentListGroupingMode,
  ToolApprovalMode,
} from '@shared/karton-contracts/ui/shared-types';
import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import {
  OverlayScrollbar,
  type OverlayScrollbarRef,
} from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  IconBranchOutOutline18,
  IconCheckOutline18,
  IconChevronDownOutline18,
  IconCodeBranchOutline18,
  IconCodeCommitOutline18,
  IconFolderCloudOutline18,
  IconFolderOpenOutline18,
  IconFolderOutline18,
  IconMagnifierOutline18,
  IconPenPlusOutline18,
  IconSquareDashedOutline18,
  IconTrashOutline18,
  IconTriangleWarningOutline18,
} from 'nucleo-ui-outline-18';
import { extractTipTapText, firstWords } from '@ui/utils/text-utils';
import { cn } from '@ui/utils';
import { useEmptyAgentId } from '@ui/hooks/use-empty-agent';
import { useTrack } from '@ui/hooks/use-track';
import { AgentCard, AgentCardSkeleton } from './_components/agent-card';
import { AgentCardWithPreview } from './_components/agent-card-with-preview';
import type { CachedPreview } from '../../_components/agent-preview-panel';
import { getToolActivityLabel } from './_utils/tool-label';
import {
  useSharedAgentContextMenu,
  SharedAgentContextMenuHost,
} from '../../_components/shared-agent-context-menu';
import { DeleteConfirmPopover } from '../../_components/delete-confirm-popover';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useCommandCenter } from '../../command-center';
import { IDE_SELECTION_ITEMS } from '@shared/ide-url';
import { getBaseName } from '@shared/path-utils';

enablePatches();

// ============================================================================
// Types & helpers
// ============================================================================

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function agentHistoryEntriesEqual(
  a: AgentHistoryEntry[],
  b: AgentHistoryEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (
      ai.id !== bi.id ||
      ai.title !== bi.title ||
      ai.createdAt !== bi.createdAt ||
      ai.lastMessageAt !== bi.lastMessageAt ||
      ai.messageCount !== bi.messageCount ||
      ai.parentAgentInstanceId !== bi.parentAgentInstanceId
    )
      return false;
  }
  return true;
}

/**
 * Derive a short preview from the last assistant text output.
 * Returns the first 10 words of the most recent text part.
 * Reasoning parts show "Thinking…" instead of their content.
 * Falls back to user input draft or last sent user message.
 */
function deriveActivityText(
  history: { role: string; parts: { type: string; text?: string }[] }[],
  inputState: string,
): { text: string; isUserInput: boolean } {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'assistant') continue;
    const parts = msg.parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j]!;
      if (part.type === 'reasoning')
        return { text: 'Thinking…', isUserInput: false };
      if (part.type === 'text') {
        const snippet = firstWords(part.text ?? '', 10);
        if (snippet) return { text: snippet, isUserInput: false };
        continue;
      }
      if (part.type.startsWith('tool-')) {
        return { text: getToolActivityLabel(part.type), isUserInput: false };
      }
    }
    break;
  }

  // Fall back to persisted input draft (already plain text, skip markdown stripping)
  if (inputState) {
    const draftText = extractTipTapText(inputState).trim();
    if (draftText) {
      const snippet = firstWords(draftText, 10, false);
      if (snippet) return { text: snippet, isUserInput: true };
    }
  }

  // Fall back to last user message preview
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'user') continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j]!;
      if (part.type === 'text') {
        const snippet = firstWords(part.text ?? '', 10);
        if (snippet) return { text: snippet, isUserInput: true };
      }
    }
    break;
  }

  return { text: '', isUserInput: false };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_VISIBLE = 10;
const SHOW_MORE_INCREMENT = 20;
const INITIAL_HISTORY_FETCH = DEFAULT_VISIBLE + SHOW_MORE_INCREMENT; // 30
const DEFAULT_VISIBLE_WORKTREES_PER_REPO = 6;
const SHOW_MORE_WORKTREES_INCREMENT = 10;
const NO_WORKSPACE_GROUP_KEY = '__no-workspace__';

function getRemoteRepositoryOpenLabel(url: string | null | undefined): string {
  if (!url) return 'Open remote repository';

  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'github.com' || host.endsWith('.github.com')) {
      return 'Open in GitHub';
    }
    if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) {
      return 'Open in GitLab';
    }
    if (host === 'bitbucket.org' || host.endsWith('.bitbucket.org')) {
      return 'Open in Bitbucket';
    }
  } catch {
    return 'Open remote repository';
  }

  return 'Open remote repository';
}

// ============================================================================
// Time grouping
// ============================================================================

type GroupLabel =
  | 'Today'
  | 'Yesterday'
  | 'Last 7 days'
  | 'Last 30 days'
  | 'Older';

function getGroupLabel(timestamp: number): GroupLabel {
  // A zero timestamp means no messages yet — treat as "Today".
  if (!timestamp) return 'Today';
  // Bucket by calendar days (local date), not elapsed 24-hour windows.
  const now = new Date();
  const ts = new Date(timestamp);
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const tsMidnight = new Date(
    ts.getFullYear(),
    ts.getMonth(),
    ts.getDate(),
  ).getTime();
  const diffDays = Math.round((nowMidnight - tsMidnight) / 86_400_000);
  if (diffDays < 0) return 'Today'; // clock skew
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Last 7 days';
  if (diffDays <= 30) return 'Last 30 days';
  return 'Older';
}

type GroupedItem =
  | { type: 'agent'; agent: MergedAgentEntry }
  | { type: 'header'; label: GroupLabel };

function insertGroupHeaders(agents: MergedAgentEntry[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let currentGroup: GroupLabel | null = null;
  for (const agent of agents) {
    const group = getGroupLabel(agent.lastMessageAt);
    if (group !== currentGroup) {
      currentGroup = group;
      result.push({ type: 'header', label: group });
    }
    result.push({ type: 'agent', agent });
  }
  return result;
}

// ============================================================================
// Sortable rows
// ============================================================================

function isPinnedDragBlockedTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('[data-no-dnd="true"], [contenteditable="true"]')
  );
}

class PinnedPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        event: ReactPointerEvent,
        { onActivation }: PointerSensorOptions,
      ) => {
        const nativeEvent = event.nativeEvent;
        if (
          isPinnedDragBlockedTarget(nativeEvent.target) ||
          !nativeEvent.isPrimary ||
          nativeEvent.button !== 0
        ) {
          return false;
        }

        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

function SortableWorkspaceGroup({
  repo,
  children,
}: {
  repo: WorkspaceRepoGroup;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: repo.key,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-px',
        isDragging && '[&_*]:!cursor-grabbing',
      )}
      style={style}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function SortablePinnedAgentCard({
  agent,
  isOpen,
  isPreviewOpen,
  hasUnseen,
  contextMenuState,
  onClick,
  onRename,
  onTogglePinned,
  cache,
}: {
  agent: MergedAgentEntry;
  isOpen: boolean;
  isPreviewOpen: boolean;
  hasUnseen: boolean;
  contextMenuState: ReturnType<typeof useSharedAgentContextMenu>[0];
  onClick: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onTogglePinned: (id: string) => void;
  cache: Map<string, CachedPreview>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: agent.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'cursor-grabbing' : 'cursor-pointer'}
      style={style}
      {...attributes}
      {...listeners}
    >
      <AgentCardWithPreview
        id={agent.id}
        title={agent.title}
        isActive={isOpen}
        isPreviewActive={isPreviewOpen}
        isWorking={agent.isWorking}
        isWaitingForUser={agent.isWaitingForUser}
        hasError={agent.hasError}
        hasUnseen={hasUnseen}
        activityText={agent.activityText}
        activityIsUserInput={agent.activityIsUserInput}
        lastMessageAt={agent.lastMessageAt}
        contextMenuState={contextMenuState}
        onClick={onClick}
        onRename={onRename}
        isPinned
        onTogglePinned={onTogglePinned}
        cache={cache}
        isLiveAgent={agent.isLive}
      />
    </div>
  );
}

function AggregateStatusDot({
  className,
  dotClassName,
}: {
  className?: string;
  dotClassName: string | null;
}) {
  if (!dotClassName) return null;
  return (
    <div
      className={cn(
        'relative flex size-3 shrink-0 items-center justify-center dark:brightness-125',
        className,
      )}
    >
      <div className={cn('relative size-1.5 shrink-0', dotClassName)}>
        <div className={cn('size-full rounded-full', dotClassName)} />
        <div
          className={cn(
            'absolute inset-0 size-full animate-ping rounded-full',
            dotClassName,
          )}
        />
      </div>
    </div>
  );
}

function WorkspaceGroupHeader({
  label,
  depth,
  collapsed,
  dotClassName,
  hasContent,
  collapsible = hasContent,
  idleIcon: IdleIcon,
  onToggle,
  onOpenInFileManager,
  onOpenRemoteRepository,
  openRemoteRepositoryLabel,
  openInFileManagerIcon: OpenInFileManagerIcon = IconFolderOpenOutline18,
  onDeleteWorktree,
  onCreateAgent,
  hideActions = false,
}: {
  label: string;
  depth: 0 | 1;
  collapsed: boolean;
  dotClassName: string | null;
  hasContent: boolean;
  collapsible?: boolean;
  idleIcon: typeof IconFolderOutline18 | null;
  onToggle: () => void;
  onOpenInFileManager?: () => void;
  onOpenRemoteRepository?: () => void;
  openRemoteRepositoryLabel?: string;
  openInFileManagerIcon?: typeof IconFolderOutline18;
  onDeleteWorktree?: (anchorPoint: { x: number; y: number }) => void;
  onCreateAgent?: () => void;
  hideActions?: boolean;
}) {
  const openInFileManagerLabel = `Open in ${IDE_SELECTION_ITEMS.other}`;
  const remoteRepositoryLabel =
    openRemoteRepositoryLabel ?? 'Open remote repository';

  return (
    <div
      className={cn(
        'group/workspace-header flex shrink-0 items-center gap-1 py-1 pr-1 text-muted-foreground text-xs',
        depth === 0 ? 'pt-5 pl-1 font-medium' : 'pt-2 pl-2.5 font-medium',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left',
          collapsible && 'hover:text-foreground',
        )}
        disabled={!collapsible}
        onClick={collapsible ? onToggle : undefined}
      >
        {(IdleIcon || collapsible) && (
          <span className="relative size-3 shrink-0">
            {IdleIcon && (
              <IdleIcon
                className={cn(
                  'absolute inset-0 size-3 transition-opacity duration-150 ease-out',
                  collapsible && 'group-hover/workspace-header:opacity-0',
                )}
              />
            )}
            {collapsible && (
              <IconChevronDownOutline18
                className={cn(
                  'absolute inset-0 size-3 opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover/workspace-header:opacity-100',
                  collapsed && '-rotate-90',
                )}
              />
            )}
          </span>
        )}
        <AggregateStatusDot
          dotClassName={collapsible && collapsed ? dotClassName : null}
        />
        <span className="truncate">{label}</span>
      </button>
      {!hideActions && onOpenRemoteRepository && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label={remoteRepositoryLabel}
              className="size-5 shrink-0 opacity-0 transition-opacity group-hover/workspace-header:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onOpenRemoteRepository();
              }}
            >
              <IconFolderCloudOutline18 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{remoteRepositoryLabel}</TooltipContent>
        </Tooltip>
      )}
      {!hideActions && onOpenInFileManager && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label={openInFileManagerLabel}
              className="size-5 shrink-0 opacity-0 transition-opacity group-hover/workspace-header:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onOpenInFileManager();
              }}
            >
              <OpenInFileManagerIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{openInFileManagerLabel}</TooltipContent>
        </Tooltip>
      )}
      {!hideActions && onDeleteWorktree && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label="Delete worktree"
              className="size-5 shrink-0 opacity-0 transition-opacity group-hover/workspace-header:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                onDeleteWorktree({
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                });
              }}
            >
              <IconTrashOutline18 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete worktree</TooltipContent>
        </Tooltip>
      )}
      {!hideActions && onCreateAgent && (
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label={`New agent for ${label}`}
          className="size-5 shrink-0 opacity-0 transition-opacity group-hover/workspace-header:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onCreateAgent();
          }}
        >
          <IconPenPlusOutline18 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function AgentListGroupingToggle({
  mode,
  onModeChange,
}: {
  mode: AgentListGroupingMode;
  onModeChange: (mode: AgentListGroupingMode) => void;
}) {
  const label = mode === 'workspace' ? 'Group by Workspace' : 'Group by Age';
  const options = [
    { value: 'age', label: 'Age' },
    { value: 'workspace', label: 'Workspace' },
  ] as const;

  return (
    <Menu>
      <MenuTrigger>
        <button
          type="button"
          className="flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-muted-foreground text-xs transition-colors hover:bg-foreground/8 hover:text-foreground"
          aria-label="Change agent grouping mode"
        >
          <span>{label}</span>
          <IconChevronDownOutline18 className="size-3 shrink-0" />
        </button>
      </MenuTrigger>
      <MenuContent side="bottom" align="end" sideOffset={2} size="xs">
        {options.map((option) => (
          <MenuItem
            key={option.value}
            size="xs"
            onClick={() => onModeChange(option.value)}
          >
            <IconCheckOutline18
              className={cn(
                'size-3 shrink-0',
                mode !== option.value && 'opacity-0',
              )}
            />
            {option.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

// ============================================================================
// AgentsList
// ============================================================================

export function AgentsList() {
  const [openAgent, setOpenAgent] = useOpenAgent();
  const { previewAgentId } = useAgentSwitcher();
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const setLastOpenAgentId = useKartonProcedure(
    (p) => p.browser.setLastOpenAgentId,
  );
  const deleteAgent = useKartonProcedure((p) => p.agents.delete);
  const setAgentTitle = useKartonProcedure((p) => p.agents.setTitle);
  const markAsRead = useKartonProcedure((p) => p.agents.markAsRead);
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );
  const getAgentHistoryEntriesByIds = useKartonProcedure(
    (p) => p.agents.getAgentHistoryEntriesByIds,
  );
  const listGitWorktreesByPath = useKartonProcedure(
    (p) => p.toolbox.listGitWorktreesByPath,
  );
  const getGitRepositoryRemoteUrlByPath = useKartonProcedure(
    (p) => p.toolbox.getGitRepositoryRemoteUrlByPath,
  );
  const getGitWorktreeDeletionInfo = useKartonProcedure(
    (p) => p.toolbox.getGitWorktreeDeletionInfo,
  );
  const deleteGitWorktreeByPath = useKartonProcedure(
    (p) => p.toolbox.deleteGitWorktreeByPath,
  );
  const getAgentHistoryEntriesByIdsRef = useRef(getAgentHistoryEntriesByIds);
  getAgentHistoryEntriesByIdsRef.current = getAgentHistoryEntriesByIds;
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const { open: openCommandCenter } = useCommandCenter();
  const pinnedAgentIds = useKartonState(
    useComparingSelector((s) => s.preferences.sidebar.pinnedAgentIds),
  );
  const agentListGroupingMode = useKartonState(
    (s) => s.preferences.sidebar.agentListGroupingMode,
  );
  const workspaceGroupOrder = useKartonState(
    useComparingSelector((s) => s.preferences.sidebar.workspaceGroupOrder),
  );
  const collapsedWorkspaceGroupKeys = useKartonState(
    useComparingSelector(
      (s) => s.preferences.sidebar.collapsedWorkspaceGroupKeys,
    ),
  );

  const [, emptyAgentIdRef] = useEmptyAgentId();

  // Track app start time so agents created during this session always show.
  const appStartTimeRef = useRef(Date.now());

  // Per-surface preview cache. Survives the ActiveAgents mount lifetime so
  // re-hovering the same card is instant. Not shared with the selector's
  // cache on purpose — the selector clears on dropdown close and we don't
  // want that side-effect to hit cards.
  const previewCacheRef = useRef<Map<string, CachedPreview>>(new Map());

  const openAgentModelId = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.activeModelId ?? null)
      : null,
  );
  const openAgentToolApprovalMode = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.toolApprovalMode ?? null)
      : null,
  );
  const currentMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );
  const openAgentModelIdRef = useRef(openAgentModelId);
  openAgentModelIdRef.current = openAgentModelId;
  const openAgentToolApprovalModeRef = useRef<ToolApprovalMode | null>(
    openAgentToolApprovalMode,
  );
  openAgentToolApprovalModeRef.current = openAgentToolApprovalMode;
  const currentMountPathsRef = useRef(currentMounts.map((m) => m.path));
  currentMountPathsRef.current = currentMounts.map((m) => m.path);

  // Optimistic creation: show a skeleton card immediately while the backend
  // creates the agent. Cleared once the new agent appears in the real list.
  const [pendingCreate, setPendingCreate] = useState(false);
  const agentCountAtCreateRef = useRef(0);

  const agents = useKartonState(
    useComparingSelector(
      (s): ActiveAgentCardData[] =>
        Object.entries(s.agents.instances)
          .filter(([_, agent]) => agent.type === AgentTypes.CHAT)
          .map(([id, agent]) => {
            const history = agent.state.history;
            const lastMsg = history[history.length - 1]!;
            const hasPendingQuestion = !!s.toolbox[id]?.pendingUserQuestion;
            // Detect any open tool-approval requests in the last assistant message.
            const hasPendingToolApproval = (() => {
              const h = agent.state.history;
              for (let i = h.length - 1; i >= 0; i--) {
                const msg = h[i]!;
                if (msg.role !== 'assistant') continue;
                return msg.parts.some(
                  (p: { type: string; state?: string }) =>
                    p.state === 'approval-requested',
                );
              }
              return false;
            })();
            const isWorking = agent.state.isWorking;
            const rawActivity = hasPendingQuestion
              ? { text: 'Waiting for response...', isUserInput: false }
              : deriveActivityText(
                  history as {
                    role: string;
                    parts: { type: string; text?: string }[];
                  }[],
                  agent.state.inputState,
                );
            // When the agent is actively working but we only have a
            // user-input fallback, show "Working…" instead.
            const activity =
              isWorking && rawActivity.isUserInput
                ? { text: 'Working…', isUserInput: false }
                : rawActivity;
            return {
              id,
              title: agent.state.title,
              isWorking: agent.state.isWorking,
              isWaitingForUser: hasPendingQuestion || hasPendingToolApproval,
              activityText: activity.text,
              activityIsUserInput: activity.isUserInput,
              hasError:
                !!agent.state.error &&
                agent.state.error.kind !== 'plan-limit-exceeded',
              unread: !!agent.state.unread,
              lastMessageAt: lastMsg?.metadata?.createdAt
                ? new Date(lastMsg.metadata.createdAt).getTime()
                : 0,
              createdAt: agent.state.history[0]?.metadata?.createdAt
                ? new Date(agent.state.history[0].metadata.createdAt).getTime()
                : 0,
              messageCount: history.length,
              mountedWorkspaces: s.toolbox[id]?.workspace?.mounts ?? [],
            };
          }),
      activeAgentCardsEqual,
    ),
  );

  // Optimistic removal: cards are hidden immediately while the backend processes.
  // Used for "Delete" (permanent). Shared via context so SidebarTopSection's
  // auto-select effect doesn't ping-pong openAgent back onto a being-removed id.
  const {
    pending: pendingRemovals,
    add: addPendingRemoval,
    remove: removePendingRemoval,
  } = usePendingRemovals();
  const pendingRemovalsRef = useRef(pendingRemovals);
  pendingRemovalsRef.current = pendingRemovals;

  // Hide skeleton as soon as agents list grows (same render cycle), rather
  // than waiting for the promise callback which lags 1-2 frames behind.
  const showCreateSkeleton =
    pendingCreate && agents.length <= agentCountAtCreateRef.current;

  const track = useTrack();

  const handleCreateAgent = useCallback(() => {
    void track('chat-new-agent-clicked', { source: 'sidebar-active-agents' });

    // Reuse an existing empty agent instead of creating a new one.
    // Uses refs so this callback isn't recreated when pendingRemovals changes.
    const existingEmpty = emptyAgentIdRef.current;
    if (existingEmpty && !pendingRemovalsRef.current.has(existingEmpty)) {
      setOpenAgent(existingEmpty);
      void setLastOpenAgentId(existingEmpty);
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
      return;
    }

    agentCountAtCreateRef.current = agents.length;
    setPendingCreate(true);
    window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
    const currentModelId = openAgentModelIdRef.current ?? undefined;
    const currentToolApprovalMode =
      openAgentToolApprovalModeRef.current ?? undefined;
    const paths = currentMountPathsRef.current;
    void createAgent(
      undefined,
      currentModelId,
      currentToolApprovalMode,
      paths.length > 0 ? paths : undefined,
    ).then((id) => {
      setOpenAgent(id);
      setPendingCreate(false);
      void setLastOpenAgentId(id);
    });
  }, [agents.length, createAgent, emptyAgentIdRef, setOpenAgent, track]);

  const pendingScrollToCreatedAgentRef = useRef<string | null>(null);

  const handleOpenWorkspaceInFileManager = useCallback(
    (workspacePath: string) => {
      window.open(
        `stagewise://reveal-file/${encodeURIComponent(workspacePath)}`,
        '_blank',
      );
    },
    [],
  );

  const handleOpenRemoteRepository = useCallback(
    (workspacePath: string) => {
      void getGitRepositoryRemoteUrlByPath(workspacePath)
        .then((url) => {
          if (url) void openExternalUrl(url);
        })
        .catch((err) => {
          console.error('Failed to open remote repository:', err);
        });
    },
    [getGitRepositoryRemoteUrlByPath, openExternalUrl],
  );

  const [worktreeDelete, setWorktreeDelete] = useState<{
    path: string;
    label: string;
    info: WorkspaceGitWorktreeDeletionInfo | null;
    loading: boolean;
    error: string | null;
    anchorPoint: { x: number; y: number };
    agentIds: string[];
    deleteAgents: boolean;
  } | null>(null);

  const handleDeleteWorktree = useCallback(
    (
      worktreePath: string,
      label: string,
      anchorPoint: { x: number; y: number },
      agentIds: string[],
    ) => {
      setWorktreeDelete({
        path: worktreePath,
        label,
        info: null,
        loading: true,
        error: null,
        anchorPoint,
        agentIds,
        deleteAgents: false,
      });
      void getGitWorktreeDeletionInfo(worktreePath)
        .then((info) => {
          setWorktreeDelete((current) =>
            current?.path === worktreePath
              ? { ...current, info, loading: false }
              : current,
          );
        })
        .catch((err) => {
          setWorktreeDelete((current) =>
            current?.path === worktreePath
              ? {
                  ...current,
                  loading: false,
                  error:
                    err instanceof Error
                      ? err.message
                      : 'Failed to inspect worktree.',
                }
              : current,
          );
        });
    },
    [getGitWorktreeDeletionInfo],
  );

  const handleWorktreeDeleteConfirm = useCallback(() => {
    const target = worktreeDelete;
    if (!target?.info || target.info.isMainWorktree) return;

    const { agentIds, deleteAgents } = target;
    const worktreePath = target.info.path;
    const force = target.info.hasUncommittedChanges;

    setWorktreeDelete(null);
    void (async () => {
      // Remove the worktree FIRST. Deleting agents is destructive and
      // irreversible, so we only do it once git confirms the worktree is
      // actually gone. If we deleted agents first and the worktree removal
      // then failed (lock, fs error, race), we'd have permanently destroyed
      // chat histories while the worktree still sat on disk. By default we
      // keep agents — the backend detaches the dead mount from survivors.
      const result = await deleteGitWorktreeByPath(worktreePath, { force });
      if (!result.ok) {
        console.error('Failed to delete worktree:', result.message);
        return;
      }
      if (deleteAgents && agentIds.length > 0) {
        await Promise.allSettled(agentIds.map((id) => deleteAgent(id)));
      }
      // Refetch history so surviving agents drop the now-deleted worktree from
      // their persisted mounts (getAgentsHistoryList filters missing paths).
      // Without this the stale mount lingers in the history fallback and the
      // agent keeps showing under the deleted worktree group.
      try {
        const entries = await getAgentsHistoryList(0, fetchLimitRef.current);
        setHistoryList(entries);
      } catch (err) {
        console.error(
          'Failed to refetch agent history after worktree deletion:',
          err,
        );
      }
    })();
  }, [
    deleteAgent,
    deleteGitWorktreeByPath,
    getAgentsHistoryList,
    worktreeDelete,
  ]);

  const handleCreateAgentForWorkspace = useCallback(
    (workspacePath: string) => {
      void track('chat-new-agent-clicked', {
        source: 'sidebar-workspace-group',
      });
      agentCountAtCreateRef.current = agents.length;
      setPendingCreate(true);
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
      const currentModelId = openAgentModelIdRef.current ?? undefined;
      const currentToolApprovalMode =
        openAgentToolApprovalModeRef.current ?? undefined;
      void createAgent(
        undefined,
        currentModelId,
        currentToolApprovalMode,
        [workspacePath],
        true,
      ).then((id) => {
        pendingScrollToCreatedAgentRef.current = id;
        setOpenAgent(id);
        setPendingCreate(false);
        void setLastOpenAgentId(id);
      });
    },
    [agents.length, createAgent, setLastOpenAgentId, setOpenAgent, track],
  );

  // Cmd/Ctrl+N: create (or focus an existing empty) agent from the keyboard.
  // Mirrors the click handler on the "new agent" button.
  useHotKeyListener(handleCreateAgent, HotkeyActions.NEW_CHAT);

  const handleClick = useCallback(
    (id: string) => {
      // Optimistic: update the open agent immediately, don't wait for the RPC.
      setOpenAgent(id);
      void setLastOpenAgentId(id).then(() => resumeAgent(id));
    },
    [resumeAgent, setOpenAgent, setLastOpenAgentId],
  );

  const isAgentWorking = useCallback(
    (id: string) => agents.some((agent) => agent.id === id && agent.isWorking),
    [agents],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (isAgentWorking(id)) return;

      addPendingRemoval(id);
      // After the backend confirms deletion, refetch so the history list
      // drops the entry. Keep the id in pendingRemovals until the refetch
      // completes — clearing it before the updated history arrives causes
      // a flicker where the stale cached entry briefly reappears.
      deleteAgent(id)
        .then(() => {
          dispatchAgentDeleted({ agentId: id });
          getAgentsHistoryList(0, fetchLimitRef.current)
            .then((entries) => {
              setHistoryList(entries);
              removePendingRemoval(id);
            })
            .catch((err) => {
              console.error(
                'Failed to refetch agent history after deletion:',
                err,
              );
              removePendingRemoval(id);
            });
        })
        .catch((err) => {
          console.error('Failed to delete agent:', err);
          removePendingRemoval(id);
        });
    },
    [
      addPendingRemoval,
      deleteAgent,
      removePendingRemoval,
      getAgentsHistoryList,
      isAgentWorking,
    ],
  );

  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      setAgentTitle(id, newTitle)
        .then(() => {
          dispatchAgentTitleRenamed({ agentId: id, title: newTitle });
        })
        .catch((err) => {
          console.error('Failed to rename agent:', err);
        });
    },
    [setAgentTitle],
  );

  // =========================================================================
  // History agents — fetched from persisted DB, merged with active agents.
  // =========================================================================

  const [historyList, setHistoryList] = useState<AgentHistoryEntry[]>([]);
  const [pinnedHistoryList, setPinnedHistoryList] = useState<
    AgentHistoryEntry[]
  >([]);

  useEffect(() => {
    const patchTitle = (
      entry: AgentHistoryEntry,
      agentId: string,
      title: string,
    ) => (entry.id === agentId ? { ...entry, title } : entry);

    const removeDeletedAgent = (
      entries: AgentHistoryEntry[],
      agentId: string,
    ) => entries.filter((entry) => entry.id !== agentId);

    const handleAgentTitleRenamed = (event: Event) => {
      if (!isAgentTitleRenamedEvent(event)) return;
      const { agentId, title } = event.detail;
      setHistoryList((current) =>
        current.map((entry) => patchTitle(entry, agentId, title)),
      );
      setPinnedHistoryList((current) =>
        current.map((entry) => patchTitle(entry, agentId, title)),
      );
    };

    const handleAgentDeleted = (event: Event) => {
      if (!isAgentDeletedEvent(event)) return;
      const { agentId } = event.detail;
      setHistoryList((current) => removeDeletedAgent(current, agentId));
      setPinnedHistoryList((current) => removeDeletedAgent(current, agentId));
    };

    window.addEventListener(AGENT_TITLE_RENAMED_EVENT, handleAgentTitleRenamed);
    window.addEventListener(AGENT_DELETED_EVENT, handleAgentDeleted);
    return () => {
      window.removeEventListener(
        AGENT_TITLE_RENAMED_EVENT,
        handleAgentTitleRenamed,
      );
      window.removeEventListener(AGENT_DELETED_EVENT, handleAgentDeleted);
    };
  }, []);

  const activeAgentIds = useKartonState(
    useComparingSelector(
      (s) => Object.keys(s.agents.instances),
      stringArraysEqual,
    ),
  );

  // Tracks how many history entries have been fetched from the server.
  // Bumped by `handleShowMore` when the visible count exceeds it.
  const fetchLimitRef = useRef(INITIAL_HISTORY_FETCH);

  // Fetch history once on startup (after first agent is active).
  const historyFetchedRef = useRef(false);
  useEffect(() => {
    if (historyFetchedRef.current) return;
    if (activeAgentIds.length === 0) return;
    historyFetchedRef.current = true;
    getAgentsHistoryList(0, fetchLimitRef.current)
      .then((entries) => {
        setHistoryList(entries);
      })
      .catch((err) => {
        console.error('Failed to fetch agent history:', err);
        historyFetchedRef.current = false;
      });
  }, [activeAgentIds, getAgentsHistoryList]);

  // Clean up pending removals once the backend has confirmed removal.
  const prevPendingSizeRef = useRef(0);
  useEffect(() => {
    if (pendingRemovals.size === 0) {
      // Refetch history after deletions complete so the list stays in sync.
      if (prevPendingSizeRef.current > 0) {
        getAgentsHistoryList(0, fetchLimitRef.current)
          .then((entries) => {
            setHistoryList(entries);
          })
          .catch((err) => {
            console.error(
              'Failed to refetch agent history after cleanup:',
              err,
            );
          });
      }
      prevPendingSizeRef.current = 0;
      return;
    }
    prevPendingSizeRef.current = pendingRemovals.size;
  }, [pendingRemovals, getAgentsHistoryList]);

  // =========================================================================
  // Merged list: active + history, sorted newest-first by lastMessageAt.
  // =========================================================================

  const mergedHistoryList = useMemo(
    () =>
      [...pinnedHistoryList, ...historyList].filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.id === entry.id) === index,
      ),
    [pinnedHistoryList, historyList],
  );

  const allAgents = useMemo(
    (): MergedAgentEntry[] =>
      mergeAgentEntries({
        activeAgents: agents,
        historyList: mergedHistoryList,
        pendingRemovals,
      }),
    [agents, mergedHistoryList, pendingRemovals],
  );

  // =========================================================================
  // Pinned agent preferences
  // =========================================================================

  const [optimisticPinnedAgentIds, setOptimisticPinnedAgentIds] = useState<
    string[] | null
  >(null);
  const displayedPinnedAgentIds = optimisticPinnedAgentIds ?? pinnedAgentIds;

  const updatePinnedAgentIds = useCallback(
    async (
      updater: (ids: string[]) => string[],
      basePinnedAgentIds = displayedPinnedAgentIds,
    ) => {
      const nextIds = updater(basePinnedAgentIds).filter(
        (id, index, ids) => ids.indexOf(id) === index,
      );

      if (stringArraysEqual(nextIds, basePinnedAgentIds)) return;

      const patches: Patch[] = [
        {
          op: 'replace',
          path: ['sidebar', 'pinnedAgentIds'],
          value: nextIds,
        },
      ];

      setOptimisticPinnedAgentIds(nextIds);
      try {
        await updatePreferences(patches);
      } catch (err) {
        setOptimisticPinnedAgentIds(null);
        throw err;
      }
    },
    [displayedPinnedAgentIds, updatePreferences],
  );

  const handlePinAgent = useCallback(
    (id: string) =>
      updatePinnedAgentIds((ids) => [
        id,
        ...ids.filter((value) => value !== id),
      ]),
    [updatePinnedAgentIds],
  );

  const handleUnpinAgent = useCallback(
    (id: string) =>
      updatePinnedAgentIds((ids) => ids.filter((value) => value !== id)),
    [updatePinnedAgentIds],
  );

  const handleTogglePinned = useCallback(
    (id: string) => {
      if (displayedPinnedAgentIds.includes(id)) {
        return handleUnpinAgent(id);
      }
      return handlePinAgent(id);
    },
    [displayedPinnedAgentIds, handlePinAgent, handleUnpinAgent],
  );

  const handleReorderPinnedAgents = useCallback(
    (ids: string[]) => updatePinnedAgentIds(() => ids),
    [updatePinnedAgentIds],
  );

  const updatePinnedAgentIdsRef = useRef(updatePinnedAgentIds);
  updatePinnedAgentIdsRef.current = updatePinnedAgentIds;
  const pinnedAgentIdsRef = useRef(pinnedAgentIds);
  pinnedAgentIdsRef.current = pinnedAgentIds;

  const activeAgentIdSet = useMemo(
    () => new Set(activeAgentIds),
    [activeAgentIds],
  );

  const historyPinnedAgentIds = useMemo(
    () => pinnedAgentIds.filter((id) => !activeAgentIdSet.has(id)),
    [activeAgentIdSet, pinnedAgentIds],
  );
  const historyPinnedAgentIdsKey = historyPinnedAgentIds.join('\0');

  useEffect(() => {
    let cancelled = false;

    if (historyPinnedAgentIds.length === 0) {
      setPinnedHistoryList((entries) => (entries.length === 0 ? entries : []));
      return;
    }

    getAgentHistoryEntriesByIdsRef
      .current(historyPinnedAgentIds)
      .then((entries) => {
        if (cancelled) return;
        setPinnedHistoryList((currentEntries) =>
          agentHistoryEntriesEqual(currentEntries, entries)
            ? currentEntries
            : entries,
        );

        const foundIds = new Set(entries.map((entry) => entry.id));
        const missingIds = historyPinnedAgentIds.filter(
          (id) => !foundIds.has(id),
        );
        if (missingIds.length > 0) {
          void updatePinnedAgentIdsRef.current(
            (ids) => ids.filter((id) => !missingIds.includes(id)),
            pinnedAgentIdsRef.current,
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch pinned agent history:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [historyPinnedAgentIdsKey]);

  const handleGroupingModeChange = useCallback(
    (mode: AgentListGroupingMode) => {
      if (mode === agentListGroupingMode) return;
      const patches: Patch[] = [
        {
          op: 'replace',
          path: ['sidebar', 'agentListGroupingMode'],
          value: mode,
        },
      ];
      void updatePreferences(patches).catch((err) => {
        console.error('Failed to update sidebar grouping mode:', err);
      });
    },
    [agentListGroupingMode, updatePreferences],
  );

  const handleReorderWorkspaceGroups = useCallback(
    (repoKeys: string[]) => {
      if (stringArraysEqual(repoKeys, workspaceGroupOrder)) return;
      const patches: Patch[] = [
        {
          op: 'replace',
          path: ['sidebar', 'workspaceGroupOrder'],
          value: repoKeys,
        },
      ];
      void updatePreferences(patches).catch((err) => {
        console.error('Failed to update sidebar workspace order:', err);
      });
    },
    [updatePreferences, workspaceGroupOrder],
  );

  // =========================================================================
  // Search
  // =========================================================================

  const searchQuery = '';

  useEffect(() => {
    if (!optimisticPinnedAgentIds) return;

    if (stringArraysEqual(optimisticPinnedAgentIds, pinnedAgentIds)) {
      setOptimisticPinnedAgentIds(null);
      return;
    }

    const pinnedIdSet = new Set(pinnedAgentIds);
    const hasSamePinnedIds =
      optimisticPinnedAgentIds.length === pinnedAgentIds.length &&
      optimisticPinnedAgentIds.every((id) => pinnedIdSet.has(id));

    if (!hasSamePinnedIds) {
      setOptimisticPinnedAgentIds(null);
    }
  }, [optimisticPinnedAgentIds, pinnedAgentIds]);

  const pinnedAgentIdSet = useMemo(
    () => new Set(displayedPinnedAgentIds),
    [displayedPinnedAgentIds],
  );

  const allAgentsById = useMemo(
    () => new Map(allAgents.map((agent) => [agent.id, agent])),
    [allAgents],
  );

  const { filteredPinnedAgents, filteredUnpinnedAgents } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = (agent: MergedAgentEntry) =>
      !q || agent.title.toLowerCase().includes(q);

    return {
      filteredPinnedAgents: displayedPinnedAgentIds
        .map((id) => allAgentsById.get(id))
        .filter(
          (agent): agent is MergedAgentEntry => !!agent && matchesSearch(agent),
        ),
      filteredUnpinnedAgents: allAgents.filter(
        (agent) => !pinnedAgentIdSet.has(agent.id) && matchesSearch(agent),
      ),
    };
  }, [
    allAgents,
    allAgentsById,
    displayedPinnedAgentIds,
    pinnedAgentIdSet,
    searchQuery,
  ]);

  const dndSensors = useSensors(
    useSensor(PinnedPointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const workspaceDndSensors = useSensors(
    useSensor(PinnedPointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [activePinnedDragId, setActivePinnedDragId] = useState<string | null>(
    null,
  );

  const activePinnedDragAgent = useMemo(
    () =>
      activePinnedDragId
        ? (allAgentsById.get(activePinnedDragId) ?? null)
        : null,
    [activePinnedDragId, allAgentsById],
  );

  const handlePinnedDragStart = useCallback(({ active }: DragStartEvent) => {
    setActivePinnedDragId(String(active.id));
  }, []);

  const handlePinnedDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActivePinnedDragId(null);
      if (!over || active.id === over.id) return;

      const visiblePinnedIds = filteredPinnedAgents.map((agent) => agent.id);
      const oldVisibleIndex = visiblePinnedIds.indexOf(String(active.id));
      const newVisibleIndex = visiblePinnedIds.indexOf(String(over.id));
      if (oldVisibleIndex === -1 || newVisibleIndex === -1) return;

      const reorderedVisibleIds = arrayMove(
        visiblePinnedIds,
        oldVisibleIndex,
        newVisibleIndex,
      );
      const reorderedVisibleIdSet = new Set(reorderedVisibleIds);
      let visibleIndex = 0;
      const nextPinnedIds = displayedPinnedAgentIds.map((id) => {
        if (!reorderedVisibleIdSet.has(id)) return id;
        const nextVisibleId = reorderedVisibleIds[visibleIndex++];
        return nextVisibleId ?? id;
      });

      if (!stringArraysEqual(nextPinnedIds, displayedPinnedAgentIds)) {
        void handleReorderPinnedAgents(nextPinnedIds).catch(() => {
          setOptimisticPinnedAgentIds(null);
        });
      }
    },
    [filteredPinnedAgents, handleReorderPinnedAgents, displayedPinnedAgentIds],
  );

  const handlePinnedDragCancel = useCallback(() => {
    setActivePinnedDragId(null);
  }, []);

  // =========================================================================
  // "Show more" pagination
  // =========================================================================

  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);

  // Agents created during this session always show (floor = their count).
  const agentsCreatedThisSession = useMemo(
    () =>
      filteredUnpinnedAgents.filter(
        (a) => a.createdAt >= appStartTimeRef.current,
      ).length,
    [filteredUnpinnedAgents],
  );

  const effectiveVisible = useMemo(
    () => Math.max(visibleCount, agentsCreatedThisSession, DEFAULT_VISIBLE),
    [visibleCount, agentsCreatedThisSession],
  );

  const visibleUnpinnedAgents = useMemo(
    () => filteredUnpinnedAgents.slice(0, effectiveVisible),
    [filteredUnpinnedAgents, effectiveVisible],
  );

  const groupedItems = useMemo(
    () => insertGroupHeaders(visibleUnpinnedAgents),
    [visibleUnpinnedAgents],
  );

  const hasMoreToShow = effectiveVisible < filteredUnpinnedAgents.length;

  const collapsedWorkspaceGroups = useMemo(
    () => new Set(collapsedWorkspaceGroupKeys),
    [collapsedWorkspaceGroupKeys],
  );
  const [visibleWorktreeCountsByRepo, setVisibleWorktreeCountsByRepo] =
    useState<Record<string, number>>({});
  const [worktreeListsByRepo, setWorktreeListsByRepo] = useState<
    ReadonlyMap<string, WorkspaceGitWorktreesResult | null>
  >(new Map());
  const [remoteRepositoryUrlsByRepo, setRemoteRepositoryUrlsByRepo] = useState<
    ReadonlyMap<string, string | null>
  >(new Map());
  const loadingWorktreeReposRef = useRef<Set<string>>(new Set());
  const loadingRemoteRepositoryReposRef = useRef<Set<string>>(new Set());
  const workspaceGroupOrderRef = useRef<WorkspaceGroupOrder>({
    repoKeys: workspaceGroupOrder,
    worktreeKeysByRepo: {},
  });
  const prevWorkspaceGroupKeysRef = useRef<Set<string>>(new Set());

  const filteredWorkspaceAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAgents.filter(
      (agent) => !q || agent.title.toLowerCase().includes(q),
    );
  }, [allAgents, searchQuery]);

  const visibleNoWorkspaceAgents = useMemo(
    () =>
      filteredWorkspaceAgents.filter(
        (agent) => agent.mountedWorkspaces.length === 0,
      ),
    [filteredWorkspaceAgents],
  );

  const workspaceGroups = useMemo(() => {
    const nextGroups = buildWorkspaceAgentGroups({
      entries: filteredWorkspaceAgents,
      pinnedIds: pinnedAgentIdSet,
      worktreeLists: worktreeListsByRepo,
      groupOrder: workspaceGroupOrderRef.current,
    });
    const order = workspaceGroupOrderRef.current;
    order.repoKeys = workspaceGroupOrder;
    const nextKeys = new Set(nextGroups.map((group) => group.key));
    const newRepoKeys: string[] = [];

    for (const group of nextGroups) {
      if (!order.repoKeys.includes(group.key)) {
        newRepoKeys.push(group.key);
      }
      const worktreeOrder = order.worktreeKeysByRepo[group.key] ?? [];
      for (const worktree of group.worktrees) {
        if (!worktreeOrder.includes(worktree.key)) {
          if (worktree.isRoot) worktreeOrder.unshift(worktree.key);
          else worktreeOrder.push(worktree.key);
        }
      }
      order.worktreeKeysByRepo[group.key] = Array.from(new Set(worktreeOrder));
    }

    order.repoKeys = [
      ...newRepoKeys,
      ...order.repoKeys.filter((key) => nextKeys.has(key)),
    ];
    prevWorkspaceGroupKeysRef.current = nextKeys;

    return buildWorkspaceAgentGroups({
      entries: filteredWorkspaceAgents,
      pinnedIds: pinnedAgentIdSet,
      worktreeLists: worktreeListsByRepo,
      groupOrder: order,
    });
  }, [
    filteredWorkspaceAgents,
    pinnedAgentIdSet,
    workspaceGroupOrder,
    worktreeListsByRepo,
  ]);

  const [activeWorkspaceDragKey, setActiveWorkspaceDragKey] = useState<
    string | null
  >(null);

  const activeWorkspaceDragRepo = useMemo(
    () =>
      activeWorkspaceDragKey
        ? (workspaceGroups.find(
            (repo) => repo.key === activeWorkspaceDragKey,
          ) ?? null)
        : null,
    [activeWorkspaceDragKey, workspaceGroups],
  );

  const handleWorkspaceDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveWorkspaceDragKey(String(active.id));
  }, []);

  const handleWorkspaceDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveWorkspaceDragKey(null);
      if (!over || active.id === over.id) return;

      const repoKeys = workspaceGroups.map((repo) => repo.key);
      const oldIndex = repoKeys.indexOf(String(active.id));
      const newIndex = repoKeys.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      handleReorderWorkspaceGroups(arrayMove(repoKeys, oldIndex, newIndex));
    },
    [handleReorderWorkspaceGroups, workspaceGroups],
  );

  const handleWorkspaceDragCancel = useCallback(() => {
    setActiveWorkspaceDragKey(null);
  }, []);

  useEffect(() => {
    if (agentListGroupingMode !== 'workspace') return;

    for (const group of workspaceGroups) {
      if (!group.git) continue;
      if (worktreeListsByRepo.has(group.git.repositoryId)) continue;
      if (loadingWorktreeReposRef.current.has(group.git.repositoryId)) continue;

      loadingWorktreeReposRef.current.add(group.git.repositoryId);
      listGitWorktreesByPath(group.path)
        .then((result) => {
          setWorktreeListsByRepo((current) => {
            const next = new Map(current);
            next.set(group.git!.repositoryId, result);
            return next;
          });
        })
        .catch((err) => {
          console.error('Failed to fetch workspace worktrees:', err);
          setWorktreeListsByRepo((current) => {
            const next = new Map(current);
            next.set(group.git!.repositoryId, null);
            return next;
          });
        })
        .finally(() => {
          loadingWorktreeReposRef.current.delete(group.git!.repositoryId);
        });
    }
  }, [
    agentListGroupingMode,
    listGitWorktreesByPath,
    workspaceGroups,
    worktreeListsByRepo,
  ]);

  useEffect(() => {
    if (agentListGroupingMode !== 'workspace') return;

    for (const group of workspaceGroups) {
      if (!group.git) continue;
      if (remoteRepositoryUrlsByRepo.has(group.git.repositoryId)) continue;
      if (loadingRemoteRepositoryReposRef.current.has(group.git.repositoryId)) {
        continue;
      }

      loadingRemoteRepositoryReposRef.current.add(group.git.repositoryId);
      getGitRepositoryRemoteUrlByPath(group.path)
        .then((url) => {
          setRemoteRepositoryUrlsByRepo((current) => {
            const next = new Map(current);
            next.set(group.git!.repositoryId, url);
            return next;
          });
        })
        .catch((err) => {
          console.error('Failed to fetch remote repository URL:', err);
          setRemoteRepositoryUrlsByRepo((current) => {
            const next = new Map(current);
            next.set(group.git!.repositoryId, null);
            return next;
          });
        })
        .finally(() => {
          loadingRemoteRepositoryReposRef.current.delete(
            group.git!.repositoryId,
          );
        });
    }
  }, [
    agentListGroupingMode,
    getGitRepositoryRemoteUrlByPath,
    remoteRepositoryUrlsByRepo,
    workspaceGroups,
  ]);

  const findWorkspaceGroupKeysForAgent = useCallback(
    (agentId: string): string[] => {
      if (visibleNoWorkspaceAgents.some((agent) => agent.id === agentId)) {
        return [NO_WORKSPACE_GROUP_KEY];
      }

      for (const repo of workspaceGroups) {
        if (repo.directAgents.some((row) => row.agent.id === agentId)) {
          return [repo.key];
        }

        const worktree = repo.worktrees.find((group) =>
          group.agents.some((row) => row.agent.id === agentId),
        );
        if (worktree) return [repo.key, `${repo.key}:${worktree.key}`];
      }

      return [];
    },
    [visibleNoWorkspaceAgents, workspaceGroups],
  );

  const updateCollapsedWorkspaceGroupKeys = useCallback(
    (keys: string[]) => {
      const nextKeys = keys.filter(
        (key, index, values) => values.indexOf(key) === index,
      );
      if (stringArraysEqual(nextKeys, collapsedWorkspaceGroupKeys)) return;

      const patches: Patch[] = [
        {
          op: 'replace',
          path: ['sidebar', 'collapsedWorkspaceGroupKeys'],
          value: nextKeys,
        },
      ];
      void updatePreferences(patches).catch((err) => {
        console.error('Failed to update collapsed workspace groups:', err);
      });
    },
    [collapsedWorkspaceGroupKeys, updatePreferences],
  );

  const toggleWorkspaceGroupCollapsed = useCallback(
    (key: string) => {
      const next = new Set(collapsedWorkspaceGroups);
      if (next.has(key)) {
        next.delete(key);
        setVisibleWorktreeCountsByRepo((counts) => {
          if (counts[key] === undefined) return counts;
          const nextCounts = { ...counts };
          delete nextCounts[key];
          return nextCounts;
        });
      } else {
        next.add(key);
      }
      updateCollapsedWorkspaceGroupKeys(Array.from(next));
    },
    [collapsedWorkspaceGroups, updateCollapsedWorkspaceGroupKeys],
  );

  const handleShowMoreWorktrees = useCallback((repoKey: string) => {
    setVisibleWorktreeCountsByRepo((current) => ({
      ...current,
      [repoKey]:
        (current[repoKey] ?? DEFAULT_VISIBLE_WORKTREES_PER_REPO) +
        SHOW_MORE_WORKTREES_INCREMENT,
    }));
  }, []);

  const handleShowMore = useCallback(() => {
    setVisibleCount((c) => {
      const next = c + SHOW_MORE_INCREMENT;
      // Fetch the next page from the server when the visible count
      // reaches or exceeds what's been loaded so far. Using >=
      // ensures the first click past the initial fetch actually
      // triggers a server request. No end-guard is needed —
      // hasMoreToShow naturally hides the button when all visible
      // items fit within the fetched set.
      if (next >= fetchLimitRef.current) {
        fetchLimitRef.current += SHOW_MORE_INCREMENT;
        getAgentsHistoryList(0, fetchLimitRef.current)
          .then((entries) => {
            setHistoryList(entries);
          })
          .catch((err) => {
            console.error('Failed to fetch more agent history:', err);
            fetchLimitRef.current -= SHOW_MORE_INCREMENT;
          });
      }
      return next;
    });
  }, [getAgentsHistoryList]);

  // =========================================================================
  // Scroll & mask
  // =========================================================================

  const scrollRef = useRef<OverlayScrollbarRef>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  scrollViewportRef.current = scrollViewport;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  /** Scroll a card into the safe (non-masked) area of the scroll container. */
  const scrollCardIntoView = useCallback((agentId: string) => {
    const container = scrollRef.current?.getViewport();
    if (!container) return;
    const card = container.querySelector<HTMLElement>(
      `[data-agent-id="${agentId}"]`,
    );
    if (!card) return;

    const fadeZone = 8;
    const cRect = container.getBoundingClientRect();
    const eRect = card.getBoundingClientRect();

    if (
      eRect.top < cRect.top + fadeZone ||
      eRect.bottom > cRect.bottom - fadeZone
    ) {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  // Expand containing groups and scroll when the shown agent instance changes.
  const lastRevealedOpenAgentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openAgent) {
      lastRevealedOpenAgentRef.current = null;
      return;
    }
    if (lastRevealedOpenAgentRef.current === openAgent) return;

    const unpinnedIndex = filteredUnpinnedAgents.findIndex(
      (agent) => agent.id === openAgent,
    );
    if (unpinnedIndex >= effectiveVisible) {
      setVisibleCount(unpinnedIndex + 1);
      return;
    }

    const keysToExpand =
      agentListGroupingMode === 'workspace'
        ? findWorkspaceGroupKeysForAgent(openAgent)
        : [];
    if (keysToExpand.length > 0) {
      const next = new Set(collapsedWorkspaceGroups);
      let changed = false;
      for (const key of keysToExpand) {
        if (next.delete(key)) changed = true;
      }
      if (changed) updateCollapsedWorkspaceGroupKeys(Array.from(next));
    }

    lastRevealedOpenAgentRef.current = openAgent;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollCardIntoView(openAgent));
    });
  }, [
    agentListGroupingMode,
    effectiveVisible,
    collapsedWorkspaceGroups,
    filteredUnpinnedAgents,
    findWorkspaceGroupKeysForAgent,
    openAgent,
    scrollCardIntoView,
    updateCollapsedWorkspaceGroupKeys,
  ]);

  useEffect(() => {
    const agentId = pendingScrollToCreatedAgentRef.current;
    if (!agentId) return;
    pendingScrollToCreatedAgentRef.current = null;
    requestAnimationFrame(() => scrollCardIntoView(agentId));
  }, [workspaceGroups, scrollCardIntoView]);

  // During Ctrl+Tab cycling, keep the preview-highlighted card visible without
  // committing the chat-panel switch.
  useEffect(() => {
    if (previewAgentId) scrollCardIntoView(previewAgentId);
  }, [previewAgentId, scrollCardIntoView]);

  // Clear the unread dot when the user opens an agent.
  useEffect(() => {
    if (openAgent) {
      void markAsRead(openAgent);
    }
  }, [openAgent, markAsRead]);

  // When an agent finishes (isWorking → false), scroll to its card.
  const prevWorkingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prevWorking = prevWorkingRef.current;
    const nowWorking = new Set<string>();

    for (const agent of agents) {
      if (agent?.isWorking) nowWorking.add(agent.id);
      if (!agent?.isWorking && prevWorking.has(agent.id)) {
        scrollCardIntoView(agent.id);
      }
    }

    prevWorkingRef.current = nowWorking;
  }, [agents, scrollCardIntoView]);

  // =========================================================================
  // Context menu & delete
  // =========================================================================

  const [ctxMenuState, ctxMenuTarget, setCtxMenuTarget] =
    useSharedAgentContextMenu();
  const handleCtxMenuClose = useCallback(
    () => setCtxMenuTarget(null),
    [setCtxMenuTarget],
  );

  const [ctxDelete, setCtxDelete] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const handleCtxDeleteRequest = useCallback(
    (id: string, x: number, y: number) => {
      if (isAgentWorking(id)) return;

      setCtxDelete({ id, x, y });
    },
    [isAgentWorking],
  );
  const handleCtxDeleteConfirm = useCallback(() => {
    const id = ctxDelete?.id;
    setCtxDelete(null);
    if (id && !isAgentWorking(id)) handleDelete(id);
  }, [ctxDelete, handleDelete, isAgentWorking]);

  const renderAgentCard = useCallback(
    (agent: MergedAgentEntry, key: string) => {
      const isOpen = agent.id === openAgent;
      const isPreviewOpen = agent.id === previewAgentId;
      const hasUnseen = !isOpen && agent.unread;

      return (
        <AgentCardWithPreview
          key={key}
          id={agent.id}
          title={agent.title}
          isActive={isOpen}
          isPreviewActive={isPreviewOpen}
          isWorking={agent.isWorking}
          isWaitingForUser={agent.isWaitingForUser}
          hasError={agent.hasError}
          hasUnseen={hasUnseen}
          activityText={agent.activityText}
          activityIsUserInput={agent.activityIsUserInput}
          lastMessageAt={agent.lastMessageAt}
          contextMenuState={ctxMenuState}
          onClick={handleClick}
          onRename={handleRename}
          isPinned={false}
          onTogglePinned={handleTogglePinned}
          cache={previewCacheRef.current}
          isLiveAgent={agent.isLive}
        />
      );
    },
    [
      ctxMenuState,
      handleClick,
      handleRename,
      handleTogglePinned,
      openAgent,
      previewAgentId,
    ],
  );

  const renderNoWorkspaceSection = useCallback(() => {
    if (visibleNoWorkspaceAgents.length === 0) return null;

    const containsOpenAgent = visibleNoWorkspaceAgents.some(
      (agent) => agent.id === openAgent,
    );
    // Force the section open whenever it holds the active agent — otherwise
    // an agent that moves here (e.g. after its worktree is deleted) stays
    // hidden behind a persisted-collapsed, non-collapsible header.
    const collapsed =
      collapsedWorkspaceGroups.has(NO_WORKSPACE_GROUP_KEY) &&
      !containsOpenAgent;
    const severity = maxSeverity(
      visibleNoWorkspaceAgents.map((agent) => getAgentStateSeverity(agent)),
    );

    return (
      <div className="contents">
        <WorkspaceGroupHeader
          label="No workspace"
          depth={0}
          collapsed={collapsed}
          dotClassName={getSeverityDotClass(severity)}
          hasContent={visibleNoWorkspaceAgents.length > 0}
          collapsible={!containsOpenAgent}
          idleIcon={IconSquareDashedOutline18}
          onToggle={() => toggleWorkspaceGroupCollapsed(NO_WORKSPACE_GROUP_KEY)}
          onOpenInFileManager={() => undefined}
          hideActions
        />
        {!collapsed &&
          visibleNoWorkspaceAgents.map((agent) =>
            renderAgentCard(agent, `no-workspace:${agent.id}`),
          )}
      </div>
    );
  }, [
    collapsedWorkspaceGroups,
    openAgent,
    renderAgentCard,
    toggleWorkspaceGroupCollapsed,
    visibleNoWorkspaceAgents,
  ]);

  const renderWorktreeGroup = useCallback(
    (repo: WorkspaceRepoGroup, worktree: WorkspaceWorktreeGroup) => {
      const key = `${repo.key}:${worktree.key}`;
      const containsOpenAgent = worktree.agents.some(
        (row) => row.agent.id === openAgent,
      );
      // Force open when it holds the active agent so a non-collapsible
      // header can never hide the currently open agent.
      const collapsed = collapsedWorkspaceGroups.has(key) && !containsOpenAgent;

      return (
        <div key={key} className="contents">
          <WorkspaceGroupHeader
            label={worktree.label}
            depth={1}
            collapsed={collapsed}
            dotClassName={getSeverityDotClass(worktree.severity)}
            hasContent={worktree.agents.length > 0}
            collapsible={worktree.agents.length > 0 && !containsOpenAgent}
            idleIcon={
              worktree.isRoot ? IconCodeCommitOutline18 : IconBranchOutOutline18
            }
            onToggle={() => toggleWorkspaceGroupCollapsed(key)}
            onOpenInFileManager={() =>
              handleOpenWorkspaceInFileManager(worktree.path)
            }
            openInFileManagerIcon={
              worktree.isRoot ? IconFolderOutline18 : undefined
            }
            onDeleteWorktree={
              worktree.isRoot
                ? undefined
                : (anchorPoint) =>
                    handleDeleteWorktree(
                      worktree.path,
                      worktree.label,
                      anchorPoint,
                      // Only agents that live *exclusively* in this worktree
                      // are candidates for deletion. Agents also connected to
                      // other workspaces must be preserved — the backend just
                      // detaches the dead mount from them.
                      worktree.agents
                        .filter(
                          (row) => row.agent.mountedWorkspaces.length <= 1,
                        )
                        .map((row) => row.agent.id),
                    )
            }
            onCreateAgent={() => handleCreateAgentForWorkspace(worktree.path)}
          />
          {!collapsed &&
            worktree.agents.map((row, index) =>
              renderAgentCard(
                row.agent,
                `${repo.key}:${worktree.key}:${row.agent.id}:${index}`,
              ),
            )}
        </div>
      );
    },
    [
      collapsedWorkspaceGroups,
      handleCreateAgentForWorkspace,
      handleDeleteWorktree,
      handleOpenWorkspaceInFileManager,
      openAgent,
      renderAgentCard,
      toggleWorkspaceGroupCollapsed,
    ],
  );

  const renderWorkspaceGroup = useCallback(
    (repo: WorkspaceRepoGroup, sortable = false) => {
      const hasContent =
        repo.directAgents.length > 0 ||
        repo.worktrees.some((worktree) => worktree.agents.length > 0);
      const containsOpenAgent =
        repo.directAgents.some((row) => row.agent.id === openAgent) ||
        repo.worktrees.some((worktree) =>
          worktree.agents.some((row) => row.agent.id === openAgent),
        );
      // Force open when it holds the active agent so a non-collapsible
      // header can never hide the currently open agent.
      const collapsed =
        collapsedWorkspaceGroups.has(repo.key) && !containsOpenAgent;
      const content = (
        <>
          <WorkspaceGroupHeader
            label={repo.label}
            depth={0}
            collapsed={collapsed}
            dotClassName={getSeverityDotClass(repo.severity)}
            hasContent={hasContent}
            collapsible={!containsOpenAgent}
            idleIcon={
              repo.isGit ? IconCodeBranchOutline18 : IconFolderOutline18
            }
            onToggle={() => toggleWorkspaceGroupCollapsed(repo.key)}
            onOpenInFileManager={() =>
              handleOpenWorkspaceInFileManager(repo.path)
            }
            onOpenRemoteRepository={
              repo.isGit
                ? () => handleOpenRemoteRepository(repo.path)
                : undefined
            }
            openRemoteRepositoryLabel={
              repo.git
                ? getRemoteRepositoryOpenLabel(
                    remoteRepositoryUrlsByRepo.get(repo.git.repositoryId),
                  )
                : undefined
            }
            openInFileManagerIcon={IconFolderOutline18}
            onCreateAgent={() => handleCreateAgentForWorkspace(repo.path)}
          />
          {!collapsed &&
            repo.directAgents.map((row, index) =>
              renderAgentCard(
                row.agent,
                `${repo.key}:${row.agent.id}:${index}`,
              ),
            )}
          {!collapsed &&
            (() => {
              const visibleWorktreeCount =
                visibleWorktreeCountsByRepo[repo.key] ??
                DEFAULT_VISIBLE_WORKTREES_PER_REPO;
              const visibleWorktrees = repo.worktrees.filter(
                (worktree, index) =>
                  index < visibleWorktreeCount || worktree.agents.length > 0,
              );
              const hiddenWorktreeCount =
                repo.worktrees.length - visibleWorktrees.length;

              return (
                <>
                  {visibleWorktrees.map((worktree) =>
                    renderWorktreeGroup(repo, worktree),
                  )}
                  {hiddenWorktreeCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 ml-1 h-6 w-[calc(100%-0.25rem)] justify-start px-1.5 text-muted-foreground text-xs hover:bg-foreground/8"
                      onClick={() => handleShowMoreWorktrees(repo.key)}
                    >
                      Show more worktrees...
                    </Button>
                  )}
                </>
              );
            })()}
        </>
      );

      if (!sortable) {
        return (
          <div key={repo.key} className="contents">
            {content}
          </div>
        );
      }

      return (
        <SortableWorkspaceGroup key={repo.key} repo={repo}>
          {content}
        </SortableWorkspaceGroup>
      );
    },
    [
      collapsedWorkspaceGroups,
      handleCreateAgentForWorkspace,
      handleOpenRemoteRepository,
      handleOpenWorkspaceInFileManager,
      handleShowMoreWorktrees,
      openAgent,
      renderAgentCard,
      remoteRepositoryUrlsByRepo,
      renderWorktreeGroup,
      toggleWorkspaceGroupCollapsed,
      visibleWorktreeCountsByRepo,
    ],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex h-full flex-col group-data-[collapsed=true]:hidden">
      {/* Header: New Agent button + Search */}
      <div className="shrink-0 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="group/new-agent w-full justify-start pl-1.5 text-start font-medium hover:bg-foreground/8"
          onClick={handleCreateAgent}
        >
          <IconPenPlusOutline18 className="size-4" />
          New Agent
          <HotkeyCombo
            action={HotkeyActions.NEW_CHAT}
            className="ml-auto opacity-0 transition-opacity group-hover/new-agent:opacity-100"
            size="xs"
            variant="chrome"
          />
        </Button>
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1.5">
          <IconMagnifierOutline18 className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            aria-label="Search agents"
            placeholder="Search agents…"
            value=""
            onPointerDown={(e) => {
              if (!e.isPrimary || e.button !== 0) return;
              e.preventDefault();
              openCommandCenter({ initialMode: 'agents' });
            }}
            onFocus={() => openCommandCenter({ initialMode: 'agents' })}
            onChange={() => {}}
            className={cn(
              'w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground',
              'outline-none',
            )}
          />
          <HotkeyCombo
            action={HotkeyActions.OPEN_COMMAND_CENTER}
            className="shrink-0"
            size="xs"
            variant="chrome"
          />
        </div>
      </div>

      {/* Scrollable agent cards with time-group headers */}
      <OverlayScrollbar
        ref={scrollRef}
        className="-mr-1 min-h-5"
        contentClassName="flex flex-col gap-px pl-0.5 pt-3 pb-3.5 pr-1.5"
        options={{
          overflow: { x: 'visible' },
          scrollbars: { theme: 'os-theme-stagewise-subtle' },
        }}
        style={maskStyle}
        onViewportRef={setScrollViewport}
      >
        <div className="flex shrink-0 items-center pt-0 pr-0 pb-1 pl-1.5">
          <div className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs">
            {filteredPinnedAgents.length > 0 ? 'Pinned' : 'Agents'}
          </div>
          <AgentListGroupingToggle
            mode={agentListGroupingMode}
            onModeChange={handleGroupingModeChange}
          />
        </div>

        {filteredPinnedAgents.length > 0 && (
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            modifiers={[
              restrictToVerticalAxis,
              restrictToFirstScrollableAncestor,
            ]}
            onDragStart={handlePinnedDragStart}
            onDragEnd={handlePinnedDragEnd}
            onDragCancel={handlePinnedDragCancel}
          >
            <SortableContext
              items={filteredPinnedAgents.map((agent) => agent.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredPinnedAgents.map((agent) => {
                const isOpen = agent.id === openAgent;
                const isPreviewOpen = agent.id === previewAgentId;
                const hasUnseen = !isOpen && agent.unread;

                return (
                  <SortablePinnedAgentCard
                    key={agent.id}
                    agent={agent}
                    isOpen={isOpen}
                    isPreviewOpen={isPreviewOpen}
                    hasUnseen={hasUnseen}
                    contextMenuState={ctxMenuState}
                    onClick={handleClick}
                    onRename={handleRename}
                    onTogglePinned={handleTogglePinned}
                    cache={previewCacheRef.current}
                  />
                );
              })}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activePinnedDragAgent ? (
                <div className="[&_*]:!cursor-grabbing shadow-elevation-1">
                  <AgentCard
                    id={activePinnedDragAgent.id}
                    title={activePinnedDragAgent.title}
                    isActive={activePinnedDragAgent.id === openAgent}
                    isWorking={activePinnedDragAgent.isWorking}
                    isWaitingForUser={activePinnedDragAgent.isWaitingForUser}
                    hasError={activePinnedDragAgent.hasError}
                    hasUnseen={
                      activePinnedDragAgent.id !== openAgent &&
                      activePinnedDragAgent.unread
                    }
                    activityText={activePinnedDragAgent.activityText}
                    activityIsUserInput={
                      activePinnedDragAgent.activityIsUserInput
                    }
                    lastMessageAt={activePinnedDragAgent.lastMessageAt}
                    contextMenuState={ctxMenuState}
                    onClick={handleClick}
                    onRename={handleRename}
                    isPinned
                    onTogglePinned={handleTogglePinned}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {agentListGroupingMode === 'workspace' ? (
          <>
            {renderNoWorkspaceSection()}
            <DndContext
              sensors={workspaceDndSensors}
              collisionDetection={closestCenter}
              modifiers={[
                restrictToVerticalAxis,
                restrictToFirstScrollableAncestor,
              ]}
              onDragStart={handleWorkspaceDragStart}
              onDragEnd={handleWorkspaceDragEnd}
              onDragCancel={handleWorkspaceDragCancel}
            >
              <SortableContext
                items={workspaceGroups.map((repo) => repo.key)}
                strategy={verticalListSortingStrategy}
              >
                {workspaceGroups.map((repo) =>
                  renderWorkspaceGroup(repo, true),
                )}
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeWorkspaceDragRepo ? (
                  <div className="[&_*]:!cursor-grabbing rounded-lg bg-foreground/5">
                    {renderWorkspaceGroup(activeWorkspaceDragRepo)}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        ) : (
          groupedItems.map((item) => {
            if (item.type === 'header') {
              return (
                <div
                  key={`h-${item.label}`}
                  className="shrink-0 px-1.5 pt-3 pb-1 font-medium text-muted-foreground text-xs"
                >
                  {item.label}
                </div>
              );
            }

            return renderAgentCard(item.agent, item.agent.id);
          })
        )}
        {showCreateSkeleton && <AgentCardSkeleton />}

        {/* "Show more" button */}
        {hasMoreToShow && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start pl-1.5 text-muted-foreground text-sm hover:bg-foreground/8"
            onClick={handleShowMore}
          >
            Show more...
          </Button>
        )}
      </OverlayScrollbar>

      <SharedAgentContextMenuHost
        target={ctxMenuTarget}
        onClose={handleCtxMenuClose}
        onDeleteRequest={handleCtxDeleteRequest}
      />
      <DeleteConfirmPopover
        open={ctxDelete !== null}
        isolated
        anchorPoint={ctxDelete ? { x: ctxDelete.x, y: ctxDelete.y } : undefined}
        onOpenChange={(open) => {
          if (!open) setCtxDelete(null);
        }}
        onConfirm={handleCtxDeleteConfirm}
      />
      <DeleteConfirmPopover
        open={worktreeDelete !== null}
        isolated
        anchorPoint={worktreeDelete?.anchorPoint}
        title="Delete worktree?"
        description={
          worktreeDelete?.loading
            ? 'Checking worktree status…'
            : worktreeDelete?.info?.hasUncommittedChanges
              ? 'This worktree has uncommitted changes. Deleting it will permanently discard those changes.'
              : 'This will permanently delete this worktree from disk.'
        }
        confirmLabel={
          worktreeDelete?.info?.hasUncommittedChanges
            ? 'Delete anyway'
            : 'Delete'
        }
        confirmVariant={
          worktreeDelete?.info?.hasUncommittedChanges
            ? 'destructive'
            : 'primary'
        }
        confirmDisabled={
          worktreeDelete?.loading ||
          !worktreeDelete?.info ||
          worktreeDelete.info.isMainWorktree
        }
        onOpenChange={(open) => {
          if (!open) setWorktreeDelete(null);
        }}
        onConfirm={handleWorktreeDeleteConfirm}
      >
        <div className="mt-1 flex flex-col gap-1">
          {worktreeDelete?.info?.hasUncommittedChanges && (
            <div className="flex items-start gap-1.5 rounded-md bg-warning-background p-2 text-warning-foreground text-xs leading-snug ring-1 ring-warning-solid/30">
              <IconTriangleWarningOutline18 className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Uncommitted files in this worktree will be lost. This action
                cannot be undone.
              </span>
            </div>
          )}
          {worktreeDelete?.error && (
            <div className="text-error-foreground text-xs">
              {worktreeDelete.error}
            </div>
          )}
          {worktreeDelete && (
            <div
              className="flex flex-col gap-0.5 text-subtle-foreground text-xs"
              title={worktreeDelete.info?.path ?? worktreeDelete.path}
            >
              <div className="min-w-0 truncate">
                <span className="text-muted-foreground">Worktree: </span>
                {getBaseName(
                  worktreeDelete.info?.path ?? worktreeDelete.path,
                ) || worktreeDelete.label}
              </div>
              <div className="min-w-0 truncate">
                <span className="text-muted-foreground">
                  Branch (will be kept):{' '}
                </span>
                {worktreeDelete.info?.branch ?? 'Detached'}
              </div>
            </div>
          )}
          {worktreeDelete && worktreeDelete.agentIds.length > 0 && (
            <button
              type="button"
              className="mt-1 flex w-full cursor-pointer items-center gap-2 text-left text-foreground text-xs"
              onClick={() =>
                setWorktreeDelete((current) =>
                  current
                    ? { ...current, deleteAgents: !current.deleteAgents }
                    : current,
                )
              }
            >
              <Checkbox
                size="xs"
                tabIndex={-1}
                className="pointer-events-none"
                checked={worktreeDelete.deleteAgents}
              />
              <span>
                Also delete{' '}
                {worktreeDelete.agentIds.length === 1
                  ? 'the 1 agent'
                  : `all ${worktreeDelete.agentIds.length} agents`}{' '}
                in this worktree
              </span>
            </button>
          )}
        </div>
      </DeleteConfirmPopover>
    </div>
  );
}
