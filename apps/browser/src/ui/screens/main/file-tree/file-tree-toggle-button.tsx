import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { FolderIcon, FolderTreeIcon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { HotkeyActions } from '@shared/hotkeys';

export function FileTreeToggleButton() {
  const visible = useKartonState((s) => s.fileTree.visible);
  const setVisible = useKartonProcedure((p) => p.fileTree.setVisible);
  const label = visible ? 'Hide file tree' : 'Show file tree';
  const Icon = visible ? FolderTreeIcon : FolderIcon;

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={() => setVisible(!visible)}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          <HotkeyCombo action={HotkeyActions.TOGGLE_FILE_TREE} size="xs" />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
