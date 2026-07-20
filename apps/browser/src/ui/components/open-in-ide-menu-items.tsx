import { Button } from '@stagewise/stage-ui/components/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { IconOpenExternalOutline18 } from '@stagewise/icons';
import { getIDEFileUrl, IDE_SELECTION_ITEMS } from '@shared/ide-url';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import { useKartonState } from '@ui/hooks/use-karton';
import { IdeLogo } from './ide-logo';

type OpenTarget = 'file' | 'folder';

export function OpenInIdeMenuItems({
  absolutePath,
  target,
}: {
  absolutePath: string;
  target: OpenTarget;
}) {
  const installedIdes = useKartonState((state) => state.installedIdes);
  const path =
    target === 'folder' && !absolutePath.endsWith('/')
      ? `${absolutePath}/`
      : absolutePath;
  const open = (ide: OpenFilesInIde) =>
    window.open(getIDEFileUrl(path, ide), '_blank');

  return (
    <>
      {installedIdes.map((ide) => (
        <MenuItem key={ide} size="xs" onClick={() => open(ide)}>
          <IdeLogo ide={ide} className="size-3.5" />
          <span>Open in {IDE_SELECTION_ITEMS[ide]}</span>
        </MenuItem>
      ))}
      {installedIdes.length > 1 && <MenuSeparator />}
      <MenuItem size="xs" onClick={() => open('fileManager')}>
        <IdeLogo ide="fileManager" className="size-3.5" />
        <span>Open in {IDE_SELECTION_ITEMS.fileManager}</span>
      </MenuItem>
    </>
  );
}

export function OpenInIdeMenu({
  absolutePath,
  target,
  buttonClassName,
}: {
  absolutePath: string;
  target: OpenTarget;
  buttonClassName?: string;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger>
          <MenuTrigger>
            <Button
              className={buttonClassName}
              variant="ghost"
              size="icon-xs"
              aria-label="Open in…"
            >
              <IconOpenExternalOutline18 className="size-4" />
            </Button>
          </MenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Open in…</TooltipContent>
      </Tooltip>
      <MenuContent className="min-w-44" size="xs" align="end" sideOffset={4}>
        <OpenInIdeMenuItems absolutePath={absolutePath} target={target} />
      </MenuContent>
    </Menu>
  );
}
