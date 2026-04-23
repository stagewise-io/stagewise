import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from '@stagewise/stage-ui/components/combobox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { IconHistoryFill18 } from 'nucleo-ui-fill-18';
import { IconTrash2Outline24 } from 'nucleo-core-outline-24';
import { IconPenOutline18 } from 'nucleo-ui-outline-18';
import { cn } from '@ui/utils';
import { DeleteConfirmPopover } from '../../_components/delete-confirm-popover';
import { useInlineTitleEdit } from '../../active-agents/_components/use-inline-title-edit';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import type React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TimeAgo from 'react-timeago';
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';

// ============================================================================
// Types
// ============================================================================

export interface AgentEntry {
  id: string;
  title: string;
  lastMessageAt: Date;
  messageCount: number;
  isWorking?: boolean;
  unread?: boolean;
}

export interface AgentGroup {
  label: string;
  agents: AgentEntry[];
}

export interface AgentsSelectorProps {
  groups: AgentGroup[];
  value: string | null;
  onValueChange: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onEndReached?: () => void;
}

// ============================================================================
// Compact time-ago formatter (module-level constant)
// ============================================================================

const minimalFormatter = buildFormatter({
  prefixAgo: '',
  prefixFromNow: '',
  suffixAgo: '',
  suffixFromNow: '',
  second: '1s',
  seconds: (value) => `${value}s`,
  minute: '1m',
  minutes: (value) => `${value}m`,
  hour: '1h',
  hours: (value) => `${value}h`,
  day: '1d',
  days: (value) => `${value}d`,
  week: '1w',
  weeks: (value) => `${value}w`,
  month: '1M',
  months: (value) => `${value}M`,
  year: '1y',
  years: (value) => `${value}y`,
  wordSeparator: '',
  numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
});

// ============================================================================
// AgentListItem — one row
// ============================================================================

interface AgentListItemProps {
  agent: AgentEntry;
  isSelected: boolean;
  isEditing: boolean;
  pendingDeleteId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCommitRename: (id: string, newTitle: string) => void;
  onStartDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}

function AgentListItemImpl({
  agent,
  isSelected,
  isEditing,
  pendingDeleteId,
  onStartEdit,
  onCancelEdit,
  onCommitRename,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: AgentListItemProps) {
  const hasUnseen = !isSelected && !!agent.unread;

  const handleCommit = useCallback(
    (newTitle: string) => onCommitRename(agent.id, newTitle),
    [agent.id, onCommitRename],
  );

  const {
    isEditing: editActive,
    titleRef,
    displayTitle,
    startEditing,
    commitEdit,
    cancelEdit,
  } = useInlineTitleEdit({ title: agent.title, onCommit: handleCommit });

  // Keep local hook state in sync with the parent-driven `isEditing` flag.
  // Parent owns the "only one row editing at a time" invariant.
  //
  // All callbacks come from useInlineTitleEdit (which useCallback-wraps them).
  // `startEditing` is stable; `cancelEdit` re-creates when `title` changes,
  // which is correct — if the prop title updates mid-edit, we want cancel
  // to restore the fresh value, not a stale captured one.
  useEffect(() => {
    if (isEditing && !editActive) {
      startEditing();
    } else if (!isEditing && editActive) {
      // Parent canceled (e.g. dropdown closed, another row started editing).
      // Drop any pending changes silently.
      cancelEdit();
    }
  }, [isEditing, editActive, startEditing, cancelEdit]);

  return (
    <ComboboxItem
      key={agent.id}
      value={agent.id}
      size="xs"
      className="grid-cols-[0.75rem_1fr_auto]"
    >
      <ComboboxItemIndicator />
      <span className="col-start-2 flex w-full items-center gap-2">
        {isEditing ? (
          <span
            ref={titleRef}
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            className="min-w-0 flex-1 cursor-text truncate bg-transparent p-0 outline-none"
            // Capture-phase stop on focus: base-ui's ComboboxPopup has an
            // onFocus handler that redirects any focus landing inside the
            // list back to its Input. Stopping propagation here prevents
            // that handler from ever seeing the event.
            onFocusCapture={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDownCapture={(e) => {
              // Capture-phase stop: base-ui's ComboboxList handler would
              // otherwise steal Arrow/Enter/Escape.
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                // Commit directly instead of going through blur() — base-ui's
                // ComboboxPopup focus manager otherwise adds a perceptible
                // handshake delay before onBlur fires.
                commitEdit();
                onCancelEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
                onCancelEdit();
              }
            }}
            onKeyUpCapture={(e) => e.stopPropagation()}
            onBlur={() => {
              commitEdit();
              onCancelEdit();
            }}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }}
          >
            {displayTitle}
          </span>
        ) : (
          <span
            className={cn(
              'truncate',
              agent.isWorking && 'shimmer-text-primary',
              hasUnseen && 'animate-text-pulse-warning',
            )}
          >
            {displayTitle}
          </span>
        )}
        {!isEditing && (
          <span className="shrink-0 text-subtle-foreground text-xs">
            <TimeAgo
              date={agent.lastMessageAt}
              formatter={minimalFormatter}
              live={false}
            />
          </span>
        )}
      </span>
      <div className="col-start-3 flex h-5 items-center gap-0.5">
        {!isEditing && (
          <button
            type="button"
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
            aria-label="Rename agent"
            onPointerDown={(e) => {
              // preventDefault prevents the button from stealing focus from
              // the Combobox's virtual-focus Input. Without this, clicking the
              // pencil triggers a focus change that base-ui then "restores",
              // leaving us in a focus tug-of-war with the editable span.
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit(agent.id);
            }}
          >
            <IconPenOutline18 className="size-3" />
          </button>
        )}
        <div className="relative">
          {!isEditing && (
            <button
              type="button"
              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
              aria-label="Delete agent"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onStartDelete(agent.id);
              }}
            >
              <IconTrash2Outline24 className="size-3" />
            </button>
          )}
          {pendingDeleteId === agent.id && (
            <DeleteConfirmPopover
              open={true}
              onOpenChange={(open) => {
                if (!open) onCancelDelete();
              }}
              onConfirm={() => {
                onConfirmDelete(agent.id);
              }}
            />
          )}
        </div>
      </div>
    </ComboboxItem>
  );
}

// Custom comparator: the parent rebuilds `agent` objects on every render
// (the `toEntry` helper in SidebarTopSection returns fresh objects), so the
// default memo check sees a new reference for every sibling and re-renders
// the entire list on any state change. That stampede delays the exit from
// edit mode by hundreds of ms when there are many rows. Compare only the
// primitive fields the row actually uses; also narrow `pendingDeleteId` to
// the boolean "is this row's popover open?" so other rows' popover state
// doesn't invalidate this row. Callback props are treated as stable — they
// are all wrapped in useCallback at AgentsSelector scope and don't change
// during a rename.
const AgentListItem = memo(AgentListItemImpl, (prev, next) => {
  const pa = prev.agent;
  const na = next.agent;
  if (
    pa.id !== na.id ||
    pa.title !== na.title ||
    pa.messageCount !== na.messageCount ||
    !!pa.isWorking !== !!na.isWorking ||
    !!pa.unread !== !!na.unread ||
    pa.lastMessageAt.getTime() !== na.lastMessageAt.getTime()
  ) {
    return false;
  }
  return (
    prev.isSelected === next.isSelected &&
    prev.isEditing === next.isEditing &&
    // Narrow: we only rerender when THIS row's popover state changes.
    (prev.pendingDeleteId === pa.id) === (next.pendingDeleteId === na.id)
  );
});

// ============================================================================
// AgentsSelector
// ============================================================================

/**
 * Deep-compares AgentGroup[] by value to prevent re-renders when the
 * parent rebuilds the array with identical content (e.g. during streaming).
 */
function agentGroupsEqual(a: AgentGroup[], b: AgentGroup[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ag = a[i]!;
    const bg = b[i]!;
    if (ag.label !== bg.label) return false;
    if (ag.agents.length !== bg.agents.length) return false;
    for (let j = 0; j < ag.agents.length; j++) {
      const aa = ag.agents[j]!;
      const ba = bg.agents[j]!;
      if (
        aa.id !== ba.id ||
        aa.title !== ba.title ||
        aa.messageCount !== ba.messageCount ||
        aa.isWorking !== ba.isWorking ||
        aa.unread !== ba.unread ||
        aa.lastMessageAt.getTime() !== ba.lastMessageAt.getTime()
      )
        return false;
    }
  }
  return true;
}

export const AgentsSelector = memo(
  function AgentsSelector({
    groups,
    value,
    onValueChange,
    onDelete,
    onRename,
    onEndReached,
  }: AgentsSelectorProps) {
    const [inputValue, setInputValue] = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Filter groups by search input — skip entirely when closed
    const filteredGroups = useMemo(() => {
      if (!isOpen) return groups;
      const q = inputValue.trim().toLowerCase();
      if (!q) return groups;
      return groups
        .map((g) => ({
          ...g,
          agents: g.agents.filter((a) => a.title.toLowerCase().includes(q)),
        }))
        .filter((g) => g.agents.length > 0);
    }, [groups, inputValue, isOpen]);

    const hasResults = filteredGroups.some((g) => g.agents.length > 0);

    // Infinite scroll: observe sentinel near bottom of list
    const onEndReachedRef = useRef(onEndReached);
    onEndReachedRef.current = onEndReached;

    useEffect(() => {
      const sentinel = sentinelRef.current;
      if (!sentinel || !onEndReachedRef.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) onEndReachedRef.current?.();
        },
        { root: listRef.current, rootMargin: '0px 0px 200px 0px' },
      );
      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [hasResults, isOpen, !!onEndReached]);

    const handleValueChange = useCallback(
      (v: string | null) => {
        if (!v) return;
        // Don't trigger navigation for the row currently being edited.
        if (v === editingId) return;
        onValueChange(v);
      },
      [onValueChange, editingId],
    );

    const handleStartDelete = useCallback((id: string) => {
      setPendingDeleteId(id);
    }, []);
    const handleCancelDelete = useCallback(() => {
      setPendingDeleteId(null);
    }, []);
    const handleConfirmDelete = useCallback(
      (id: string) => {
        setPendingDeleteId(null);
        onDelete(id);
      },
      [onDelete],
    );

    const handleStartEdit = useCallback((id: string) => {
      setEditingId(id);
      setPendingDeleteId(null);
    }, []);
    const handleCancelEdit = useCallback(() => {
      setEditingId(null);
    }, []);

    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open);
      if (!open) {
        setInputValue('');
        setPendingDeleteId(null);
        setEditingId(null);
      }
    }, []);

    const showActiveAgents = useKartonState(
      (s) => s.preferences.sidebar?.showActiveAgents ?? true,
    );
    const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
    const handleToggleActiveAgents = useCallback(
      (checked: boolean) => {
        void preferencesUpdate([
          {
            op: 'replace' as const,
            path: ['sidebar', 'showActiveAgents'],
            value: checked,
          },
        ]);
      },
      [preferencesUpdate],
    );

    return (
      <Combobox
        value={value}
        onValueChange={handleValueChange}
        onInputValueChange={setInputValue}
        onOpenChange={handleOpenChange}
      >
        {/* Custom trigger: unstyled, using base-ui Trigger directly with render */}
        <ComboboxBase.Trigger
          render={(props: React.HTMLAttributes<HTMLButtonElement>) => (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-xs"
                  className="app-no-drag shrink-0"
                >
                  <IconHistoryFill18 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>Show recent chats</span>
              </TooltipContent>
            </Tooltip>
          )}
        />

        {isOpen && (
          <ComboboxContent
            side="bottom"
            sideOffset={8}
            size="xs"
            className="min-w-56 max-w-72"
          >
            <div className="mb-1">
              <ComboboxInput size="xs" placeholder="Search chats…" />
            </div>

            <div
              ref={listRef}
              className="scrollbar-hover-only max-h-48 overflow-y-auto"
            >
              <ComboboxList>
                {filteredGroups.map(({ label, agents }) => (
                  <ComboboxGroup key={label}>
                    <ComboboxGroupLabel>{label}</ComboboxGroupLabel>
                    {agents.map((agent) => (
                      <AgentListItem
                        key={agent.id}
                        agent={agent}
                        isSelected={agent.id === value}
                        isEditing={editingId === agent.id}
                        pendingDeleteId={pendingDeleteId}
                        onStartEdit={handleStartEdit}
                        onCancelEdit={handleCancelEdit}
                        onCommitRename={onRename}
                        onStartDelete={handleStartDelete}
                        onCancelDelete={handleCancelDelete}
                        onConfirmDelete={handleConfirmDelete}
                      />
                    ))}
                  </ComboboxGroup>
                ))}
              </ComboboxList>
              {onEndReached && (
                <div
                  ref={sentinelRef}
                  aria-hidden="true"
                  className="h-px shrink-0"
                />
              )}
            </div>

            {!hasResults && <ComboboxEmpty />}

            <div className="flex items-center justify-between border-border-subtle border-t pt-2 pr-1.5 pb-1 pl-2.5">
              <label
                htmlFor="show-active-agents"
                className="cursor-pointer text-muted-foreground text-xs"
              >
                Show active in sidebar
              </label>
              <Switch
                size="xs"
                id="show-active-agents"
                checked={showActiveAgents}
                onCheckedChange={handleToggleActiveAgents}
              />
            </div>
          </ComboboxContent>
        )}
      </Combobox>
    );
  },
  (prevProps, nextProps) =>
    agentGroupsEqual(prevProps.groups, nextProps.groups) &&
    prevProps.value === nextProps.value &&
    prevProps.onValueChange === nextProps.onValueChange &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onRename === nextProps.onRename &&
    prevProps.onEndReached === nextProps.onEndReached,
);
