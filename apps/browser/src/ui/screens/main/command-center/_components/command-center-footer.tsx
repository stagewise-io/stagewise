import { HotkeyActions } from '@shared/hotkeys';
import { ShortcutCombo } from '@stagewise/stage-ui/components/shortcut-key';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import type { AgentCommandItem, TabCommandItem } from '../command-center-model';

export type CommandCenterDeleteConfirmation = {
  agentId: string;
  title: string;
};

export function CommandCenterFooter({
  deleteConfirmation,
  isRenamingAgent,
  selectedAgent,
  canCopySelectedTabUrl,
  canToggleSelectedTabPin,
  selectedTab,
}: {
  deleteConfirmation: CommandCenterDeleteConfirmation | null;
  isRenamingAgent: boolean;
  selectedAgent: AgentCommandItem | null;
  canCopySelectedTabUrl: boolean;
  canToggleSelectedTabPin: boolean;
  selectedTab: TabCommandItem | null;
}) {
  if (isRenamingAgent) {
    return (
      <div className="flex h-9 items-center justify-end gap-3 border-border-subtle border-t px-3 text-muted-foreground text-xs">
        <CommandCenterFooterAction label="Cancel">
          <ShortcutCombo value="Esc" size="xs" />
        </CommandCenterFooterAction>
        <CommandCenterFooterAction label="Save">
          <ShortcutCombo value="Enter" size="xs" />
        </CommandCenterFooterAction>
      </div>
    );
  }

  if (deleteConfirmation) {
    return (
      <div className="flex h-9 items-center justify-between gap-3 border-border-subtle border-t px-3 text-xs">
        <span className="min-w-0 truncate text-foreground">
          Delete{' '}
          <span className="font-medium">“{deleteConfirmation.title}”</span>?
        </span>
        <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
          <CommandCenterFooterAction label="Cancel">
            <ShortcutCombo value="Esc" size="xs" />
          </CommandCenterFooterAction>
          <CommandCenterFooterAction label="Delete">
            <ShortcutCombo value="Enter" size="xs" />
          </CommandCenterFooterAction>
        </div>
      </div>
    );
  }

  if (selectedAgent) {
    return (
      <div className="flex h-9 items-center justify-end gap-3 border-border-subtle border-t px-3 text-muted-foreground text-xs">
        <CommandCenterFooterAction label="Rename">
          <HotkeyCombo
            action={HotkeyActions.COMMAND_CENTER_RENAME_AGENT}
            size="xs"
          />
        </CommandCenterFooterAction>
        <CommandCenterFooterAction
          label={selectedAgent.isPinned ? 'Unpin' : 'Pin'}
        >
          <HotkeyCombo
            action={HotkeyActions.COMMAND_CENTER_TOGGLE_AGENT_PIN}
            size="xs"
          />
        </CommandCenterFooterAction>
        {!selectedAgent.isWorking && (
          <CommandCenterFooterAction label="Delete">
            <HotkeyCombo
              action={HotkeyActions.COMMAND_CENTER_DELETE_AGENT}
              size="xs"
            />
          </CommandCenterFooterAction>
        )}
      </div>
    );
  }

  if (selectedTab) {
    return (
      <div className="flex h-9 items-center justify-end gap-3 border-border-subtle border-t px-3 text-muted-foreground text-xs">
        {canToggleSelectedTabPin && (
          <CommandCenterFooterAction
            label={selectedTab.isPinned ? 'Unpin' : 'Pin'}
          >
            <HotkeyCombo
              action={HotkeyActions.COMMAND_CENTER_TOGGLE_AGENT_PIN}
              size="xs"
            />
          </CommandCenterFooterAction>
        )}
        {canCopySelectedTabUrl && (
          <CommandCenterFooterAction label="Copy URL">
            <HotkeyCombo
              action={HotkeyActions.COMMAND_CENTER_COPY_TAB_URL}
              size="xs"
            />
          </CommandCenterFooterAction>
        )}
        <CommandCenterFooterAction label="Close">
          <HotkeyCombo action={HotkeyActions.CLOSE_TAB} size="xs" />
        </CommandCenterFooterAction>
      </div>
    );
  }

  return null;
}

function CommandCenterFooterAction({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span>{label}</span>
    </span>
  );
}
