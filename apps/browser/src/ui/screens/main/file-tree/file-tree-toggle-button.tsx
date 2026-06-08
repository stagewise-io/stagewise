import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { FolderIcon, FolderTreeIcon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';

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
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
