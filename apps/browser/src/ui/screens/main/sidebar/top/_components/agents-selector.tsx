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
import { cn } from '@ui/utils';
import { DeleteConfirmPopover } from '../../_components/delete-confirm-popover';
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
// Component
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
    onEndReached,
  }: AgentsSelectorProps) {
    const [inputValue, setInputValue] = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
        if (v) onValueChange(v);
      },
      [onValueChange],
    );

    const handleDeleteClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const agentId = e.currentTarget.dataset.agentId;
        if (agentId) setPendingDeleteId(agentId);
      },
      [],
    );

    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open);
      if (!open) {
        setInputValue('');
        setPendingDeleteId(null);
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
          render={(props) => (
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
                    {agents.map((agent) => {
                      const isSelected = agent.id === value;
                      const hasUnseen = !isSelected && !!agent.unread;

                      return (
                        <ComboboxItem
                          key={agent.id}
                          value={agent.id}
                          size="xs"
                          className="grid-cols-[0.75rem_1fr_auto]"
                        >
                          <ComboboxItemIndicator />
                          <span className="col-start-2 flex w-full items-center gap-2">
                            <span
                              className={cn(
                                'truncate',
                                agent.isWorking && 'shimmer-text-primary',
                                hasUnseen && 'animate-text-pulse-warning',
                              )}
                            >
                              {agent.title}
                            </span>
                            <span className="shrink-0 text-subtle-foreground text-xs">
                              <TimeAgo
                                date={agent.lastMessageAt}
                                formatter={minimalFormatter}
                                live={false}
                              />
                            </span>
                          </span>
                          <div className="relative col-start-3">
                            <button
                              type="button"
                              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
                              data-agent-id={agent.id}
                              onClick={handleDeleteClick}
                            >
                              <IconTrash2Outline24 className="size-3" />
                            </button>
                            {pendingDeleteId === agent.id && (
                              <DeleteConfirmPopover
                                open={true}
                                onOpenChange={(open) => {
                                  if (!open) setPendingDeleteId(null);
                                }}
                                onConfirm={() => {
                                  setPendingDeleteId(null);
                                  onDelete(agent.id);
                                }}
                              />
                            )}
                          </div>
                        </ComboboxItem>
                      );
                    })}
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
    prevProps.onEndReached === nextProps.onEndReached,
);
