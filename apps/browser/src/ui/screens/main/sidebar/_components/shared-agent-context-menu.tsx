import { Menu as MenuBase } from '@base-ui/react/menu';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { IconTrash2Outline24 } from 'nucleo-core-outline-24';
import {
  IconCirclePlayOutline18,
  IconCopyIdOutline18,
  IconFolderOpenOutline18,
  IconPen2Outline18,
  IconSleepingTimeOutline18,
} from 'nucleo-ui-outline-18';
import { useFloatingIsolation } from './use-floating-isolation';

/**
 * Shared right-click context menu for agent cards and list rows.
 *
 * A SINGLE `<SharedAgentContextMenuHost>` is mounted per list (grid or
 * history). Rows attach a cheap `onContextMenu` handler via
 * `buildAgentContextMenuHandler(...)` that opens this one host at the
 * cursor position. This avoids allocating a base-ui `Menu.Root` per row
 * — critical for the history list which can contain hundreds of rows.
 */

export interface AgentContextMenuTarget {
  agentId: string;
  /** Live agent instance (shows Sleep) vs suspended (shows Resume). */
  isActive: boolean;
  /** Viewport coords of the right-click — used as virtual menu anchor. */
  x: number;
  y: number;
  /** Shift-key state at trigger time — reveals dev-only actions. */
  showDev: boolean;
  /**
   * Enter inline rename mode. The row owns its own edit state, so it
   * supplies this closure at right-click time; the host just invokes it
   * when the user picks "Rename".
   */
  rename: () => void;
}

export interface SharedAgentContextMenuState {
  open: (target: AgentContextMenuTarget) => void;
}

/**
 * Create a shared menu controller. Use in the list parent:
 *
 * ```tsx
 * const [state, target, setTarget] = useSharedAgentContextMenu();
 * // ... pass `state` to rows, mount <SharedAgentContextMenuHost target={target} onClose={() => setTarget(null)} ... />
 * ```
 */
export function useSharedAgentContextMenu(): [
  SharedAgentContextMenuState,
  AgentContextMenuTarget | null,
  (target: AgentContextMenuTarget | null) => void,
] {
  const [target, setTarget] = useState<AgentContextMenuTarget | null>(null);
  const state = useMemo<SharedAgentContextMenuState>(
    () => ({ open: setTarget }),
    [],
  );
  return [state, target, setTarget];
}

/**
 * Row-side helper. Attach as
 * `onContextMenu={buildAgentContextMenuHandler(state, id, isLive, startEditing)}`.
 */
export function buildAgentContextMenuHandler(
  state: SharedAgentContextMenuState,
  agentId: string,
  isActive: boolean,
  rename: () => void,
): (e: React.MouseEvent) => void {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.open({
      agentId,
      isActive,
      x: e.clientX,
      y: e.clientY,
      showDev: e.shiftKey,
      rename,
    });
  };
}

export interface SharedAgentContextMenuHostProps {
  target: AgentContextMenuTarget | null;
  onClose: () => void;
  /** Wake a suspended agent (used when `target.isActive` is false). */
  onResume: (id: string) => void;
  /** Put an active agent to sleep (used when `target.isActive` is true). */
  onArchive: (id: string) => void;
  /** User picked "Permanently delete" — caller is expected to show a confirm dialog. */
  onDeleteRequest: (id: string) => void;
}

export const SharedAgentContextMenuHost = memo(
  function SharedAgentContextMenuHost({
    target,
    onClose,
    onResume,
    onArchive,
    onDeleteRequest,
  }: SharedAgentContextMenuHostProps) {
    const revealWorkingDirectory = useKartonProcedure(
      (p) => p.agents.revealWorkingDirectory,
    );

    const popupRef = useRef<HTMLDivElement>(null);
    useFloatingIsolation(popupRef, target !== null);

    // Virtual anchor: base-ui only needs `getBoundingClientRect()`.
    const anchor = useMemo(() => {
      if (!target) return null;
      const { x, y } = target;
      return {
        getBoundingClientRect: () =>
          DOMRect.fromRect({ x, y, width: 0, height: 0 }),
      };
    }, [target]);

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) onClose();
      },
      [onClose],
    );

    if (!target) return null;
    const { agentId, isActive, showDev, rename } = target;

    return (
      <MenuBase.Root open onOpenChange={handleOpenChange}>
        <MenuBase.Portal>
          <MenuBase.Positioner
            anchor={anchor}
            align="start"
            side="bottom"
            sideOffset={4}
            className="z-50"
          >
            <MenuBase.Popup
              ref={popupRef}
              className={cn(
                'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
                'rounded-lg border border-border-subtle bg-background p-1',
                'text-xs shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'data-ending-style:scale-90 data-starting-style:scale-90',
                'data-ending-style:opacity-0 data-starting-style:opacity-0',
              )}
            >
              <AgentMenuItem
                onClick={() => {
                  if (isActive) onArchive(agentId);
                  else onResume(agentId);
                  onClose();
                }}
              >
                {isActive ? (
                  <IconSleepingTimeOutline18 className="size-3.5 shrink-0" />
                ) : (
                  <IconCirclePlayOutline18 className="size-3.5 shrink-0" />
                )}
                <span>{isActive ? 'Sleep' : 'Resume'}</span>
              </AgentMenuItem>
              <AgentMenuItem
                onClick={() => {
                  onClose();
                  rename();
                }}
              >
                <IconPen2Outline18 className="size-3.5 shrink-0" />
                <span>Rename</span>
              </AgentMenuItem>
              <AgentMenuItem
                onClick={() => {
                  onDeleteRequest(agentId);
                  onClose();
                }}
              >
                <IconTrash2Outline24 className="size-3.5 shrink-0" />
                <span>Permanently delete</span>
              </AgentMenuItem>
              {showDev && (
                <>
                  <div className="my-0.5 h-px w-full bg-border-subtle" />
                  <AgentMenuItem
                    onClick={() => {
                      void navigator.clipboard.writeText(agentId);
                      onClose();
                    }}
                  >
                    <IconCopyIdOutline18 className="size-3.5 shrink-0" />
                    <span>Copy instance ID</span>
                  </AgentMenuItem>
                  <AgentMenuItem
                    onClick={() => {
                      void revealWorkingDirectory(agentId);
                      onClose();
                    }}
                  >
                    <IconFolderOpenOutline18 className="size-3.5 shrink-0" />
                    <span>Open data directory</span>
                  </AgentMenuItem>
                </>
              )}
            </MenuBase.Popup>
          </MenuBase.Positioner>
        </MenuBase.Portal>
      </MenuBase.Root>
    );
  },
);

/** Compact menu item — matches the styling of the file right-click menu. */
function AgentMenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <MenuBase.Item
      onClick={onClick}
      className={cn(
        'flex w-full cursor-default flex-row items-center justify-start gap-2',
        'rounded-md px-2 py-1 text-foreground text-xs outline-none',
        'transition-colors duration-150 ease-out',
        'hover:bg-surface-1 data-highlighted:bg-surface-1',
      )}
    >
      {children}
    </MenuBase.Item>
  );
}
