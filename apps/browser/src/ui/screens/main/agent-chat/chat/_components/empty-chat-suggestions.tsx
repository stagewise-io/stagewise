import { memo, useCallback, useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconXmarkFill18 } from 'nucleo-ui-fill-18';
import { IconFolder5Outline18 } from 'nucleo-ui-outline-18';

import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';

/**
 * Empty-chat suggestion list.
 *
 * Current scope (intentional minimal mode):
 * - Always renders "Connect &lt;recent-workspace&gt;" rows, regardless of
 *   whether any workspaces are already mounted. The strip below the chat
 *   input owns the "Connect new workspace" affordance via its `+` button,
 *   so this list never duplicates that.
 */

/**
 * How many recent workspace rows to show. Dismissing one promotes the
 * next-most-recent into view.
 */
const RECENT_WORKSPACE_LIMIT = 3;
const CHAT_INPUT_FOCUS_REQUESTED_EVENT = 'chat-input-focus-requested';

export interface EmptyChatSuggestionsProps {
  removedSuggestionIds: Set<string>;
  onDismiss: (id: string) => void;
}

export const EmptyChatSuggestions = memo(function EmptyChatSuggestions({
  removedSuggestionIds,
  onDismiss,
}: EmptyChatSuggestionsProps) {
  const [openAgent] = useOpenAgent();
  const recentlyOpenedWorkspaces = useKartonState(
    (s) => s.userExperience.storedExperienceData.recentlyOpenedWorkspaces,
  );
  const allMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );
  const mountedPaths = useMemo(
    () => new Set(allMounts.map((m) => m.path)),
    [allMounts],
  );
  const mountWorkspace = useKartonProcedure((p) => p.toolbox.mountWorkspace);
  const track = useTrack();

  // Filter dismissed entries BEFORE the slice so that dismissing a
  // recent workspace promotes the next-most-recent one into view.
  const sortedRecents = useMemo(() => {
    return [...recentlyOpenedWorkspaces]
      .filter((w) => !mountedPaths.has(w.path))
      .filter((w) => !removedSuggestionIds.has(`connect-workspace-${w.path}`))
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, RECENT_WORKSPACE_LIMIT);
  }, [recentlyOpenedWorkspaces, mountedPaths, removedSuggestionIds]);

  // Connecting a workspace deliberately keeps other recent workspaces
  // visible. The newly mounted workspace drops out of the list
  // automatically via the `mountedPaths` filter above.
  const connect = useCallback(
    async (path: string) => {
      if (!openAgent) return;
      track('workspace-connect-started');
      try {
        await mountWorkspace(openAgent, path);
        track('workspace-connect-finished');
        window.dispatchEvent(new Event(CHAT_INPUT_FOCUS_REQUESTED_EVENT));
      } catch {
        track('workspace-connect-failed', { source: 'recent-workspace' });
      }
    },
    [openAgent, mountWorkspace, track],
  );

  if (sortedRecents.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1">
      {sortedRecents.map((workspace) => {
        const id = `connect-workspace-${workspace.path}`;
        return (
          <SuggestionRow
            key={workspace.path}
            onActivate={() => {
              track('suggestion-clicked', {
                suggestion_id: id,
                context: 'empty-chat',
              });
              void connect(workspace.path);
            }}
            icon={<IconFolder5Outline18 className="size-3.5 shrink-0" />}
            onDismiss={() => onDismiss(id)}
            dismissTooltip="Dismiss suggestion"
          >
            <span className="shrink-0 text-sm leading-tight">
              Connect <span className="text-foreground">{workspace.name}</span>
            </span>
            <span
              className="ml-2 min-w-0 flex-1 truncate text-2xs text-subtle-foreground leading-normal group-hover/suggestion:text-muted-foreground"
              dir="rtl"
            >
              <span dir="ltr">{workspace.path}</span>
            </span>
          </SuggestionRow>
        );
      })}
    </div>
  );
});

// ============================================================================
// Shared row chrome
// ============================================================================
//
// Chrome conventions:
// - Left icon swaps to a dismiss-cross on hover when dismissable.
// - Hover/focus highlight on the entire row, click anywhere activates.

function SuggestionRow({
  onActivate,
  icon,
  onDismiss,
  dismissTooltip,
  onHoverEnter,
  children,
}: {
  onActivate: () => void;
  icon: React.ReactNode;
  onDismiss?: () => void;
  dismissTooltip?: string;
  onHoverEnter?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      onMouseEnter={onHoverEnter}
      className={cn(
        'group/suggestion relative flex w-full cursor-pointer flex-row items-center gap-2.5 rounded-lg px-2.5 py-1 text-muted-foreground outline-none',
        'hover:bg-hover-derived hover:text-foreground',
        'focus-visible:bg-hover-derived focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary-solid/40',
      )}
    >
      {/* Left icon: swaps to dismiss-cross on hover when dismissable.
          The resting icon and the X are siblings; both have explicit
          opacity classes so the resting icon actually fades out (a
          `display: contents` wrapper would not — opacity needs a box). */}
      {onDismiss ? (
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              data-dismiss
              aria-label={dismissTooltip ?? 'Dismiss suggestion'}
              className="group/dismiss relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-solid/40"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            >
              <span className="flex size-3.5 items-center justify-center group-hover/suggestion:opacity-0 group-focus-visible/suggestion:opacity-0">
                {icon}
              </span>
              <IconXmarkFill18 className="absolute size-3.5 text-muted-foreground opacity-0 group-hover/dismiss:text-foreground group-hover/suggestion:opacity-100 group-focus-visible/suggestion:opacity-100" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{dismissTooltip ?? 'Dismiss'}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}
