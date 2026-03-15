import type { ReactNode } from 'react';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu as MenuBase } from '@base-ui/react/menu';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useKartonState } from '@ui/hooks/use-karton';
import { IdeLogo } from '@ui/components/ide-logo';
import { getIDEFileUrl, IDE_SELECTION_ITEMS } from '@shared/ide-url';

const itemClassName = cn(
  'flex w-full cursor-default flex-row items-center justify-start gap-2',
  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
  'transition-colors duration-150 ease-out',
  'hover:bg-surface-1 data-highlighted:bg-surface-1',
);

export function FileContextMenu({
  relativePath,
  resolvePath,
  lineNumber,
  children,
}: {
  relativePath: string;
  resolvePath: (path: string) => string | null;
  lineNumber?: number;
  children: ReactNode;
}) {
  const globalConfig = useKartonState((s) => s.globalConfig);

  const ide = globalConfig.openFilesInIde;
  const hasIde = globalConfig.hasSetIde && ide !== 'other';
  const ideName = IDE_SELECTION_ITEMS[ide];
  const fileManagerName = IDE_SELECTION_ITEMS.other;

  const openInFileManager = () => {
    const abs = resolvePath(relativePath);
    if (!abs) return;
    window.open(getIDEFileUrl(abs, 'other', lineNumber), '_blank');
  };

  const openInIde = () => {
    const abs = resolvePath(relativePath);
    if (!abs) return;
    window.open(getIDEFileUrl(abs, ide, lineNumber), '_blank');
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<span />} className="contents">
        {children}
      </ContextMenu.Trigger>
      <MenuBase.Portal>
        <MenuBase.Positioner
          className="z-50"
          sideOffset={4}
          align="start"
          side="bottom"
        >
          <MenuBase.Popup
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-border-subtle bg-background p-1',
              'text-xs shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            <MenuBase.Item
              className={itemClassName}
              onClick={openInFileManager}
            >
              <IdeLogo ide="other" className="size-3.5 shrink-0" />
              <span>Reveal in {fileManagerName}</span>
            </MenuBase.Item>
            {hasIde && (
              <MenuBase.Item className={itemClassName} onClick={openInIde}>
                <IdeLogo ide={ide} className="size-3.5 shrink-0" />
                <span>Open in {ideName}</span>
              </MenuBase.Item>
            )}
          </MenuBase.Popup>
        </MenuBase.Positioner>
      </MenuBase.Portal>
    </ContextMenu.Root>
  );
}
