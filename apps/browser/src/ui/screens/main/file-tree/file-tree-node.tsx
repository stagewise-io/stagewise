import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu as MenuBase } from '@base-ui/react/menu';
import { FileIcon } from '@ui/components/file-icon';
import { cn } from '@ui/utils';
import type { FileTreeEntry } from '@shared/karton-contracts/ui';
import { getCurrentPlatform } from '@shared/hotkeys';
import { nativeFileManagerLabel } from '@shared/ide-url';
import {
  ChevronRightIcon,
  ClipboardPasteIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  Loader2Icon,
  PencilIcon,
  ScissorsIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  memo,
  useEffect,
  useRef,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

const menuItemClassName = cn(
  'flex w-full cursor-default flex-row items-center justify-start gap-2',
  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
  'transition-colors duration-150 ease-out',
  'hover:bg-surface-1 data-highlighted:bg-surface-1',
  'data-disabled:pointer-events-none data-disabled:opacity-45',
);

const actionModifierLabel = getCurrentPlatform() === 'mac' ? '⌘' : 'Ctrl';

function MenuShortcut({ children }: { children: string }) {
  return (
    <span className="ml-auto pl-4 font-mono text-[0.625rem] text-muted-foreground">
      {children}
    </span>
  );
}

type FileTreeNodeProps = {
  entry: FileTreeEntry;
  depth: number;
  expanded: boolean;
  focused: boolean;
  loading?: boolean;
  rowIndex: number;
  dragPath: string;
  dragPayload: string;
  canPaste: boolean;
  cut: boolean;
  dropTarget: boolean;
  canRename: boolean;
  renaming: boolean;
  onFocus: () => void;
  onToggle: () => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onStartRename: () => void;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onReveal: () => void;
};

export const FileTreeNode = memo(function FileTreeNode({
  entry,
  depth,
  expanded,
  focused,
  loading,
  rowIndex,
  dragPath,
  dragPayload,
  canPaste,
  cut,
  dropTarget,
  canRename,
  renaming,
  onFocus,
  onSelect,
  onOpen,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onStartRename,
  onRenameSubmit,
  onRenameCancel,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onReveal,
}: FileTreeNodeProps) {
  const isDirectory = entry.kind === 'directory';

  const content = renaming ? (
    <RenameRow
      entry={entry}
      depth={depth}
      expanded={expanded}
      loading={loading}
      rowIndex={rowIndex}
      onSubmit={onRenameSubmit}
      onCancel={onRenameCancel}
    />
  ) : (
    <button
      type="button"
      className={cn(
        'flex h-6 w-full items-center gap-1 rounded px-1 text-left text-xs hover:bg-hover-derived focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid focus-visible:ring-inset',
        entry.isIgnored
          ? 'text-muted-foreground opacity-45'
          : 'text-foreground',
        cut && 'opacity-45',
        dropTarget && 'bg-primary-solid/15 ring-1 ring-primary-solid/50',
      )}
      data-file-tree-entry-path={entry.relativePath}
      data-file-tree-row-index={rowIndex}
      tabIndex={focused ? 0 : -1}
      draggable={!isDirectory}
      style={{ paddingLeft: 4 + depth * 14 }}
      onContextMenu={onFocus}
      onDragStart={(event) => {
        if (isDirectory) return;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(
          'application/x-stagewise-file-path',
          dragPath,
        );
        event.dataTransfer.setData(
          'application/x-stagewise-file-tree-move',
          dragPayload,
        );
        event.dataTransfer.setData('text/plain', `[](path:${dragPath})`);
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={(event) => {
        onSelect(event);
      }}
      onDoubleClick={() => {
        if (!isDirectory) onOpen();
      }}
      title={entry.relativePath}
      onFocus={onFocus}
    >
      <TreeNodeIcon entry={entry} expanded={expanded} loading={loading} />
      <span className="min-w-0 truncate">{entry.name}</span>
    </button>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<span />} className="contents">
        {content}
      </ContextMenu.Trigger>
      <MenuBase.Portal>
        <MenuBase.Positioner
          className="z-50"
          sideOffset={4}
          align="start"
          side="bottom"
        >
          <MenuBase.Popup
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className={cn(
              'flex min-w-40 origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-border-subtle bg-background p-1',
              'text-xs shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            <MenuBase.Item
              className={menuItemClassName}
              disabled={!canRename}
              onClick={onStartRename}
            >
              <PencilIcon className="size-3.5 shrink-0" />
              <span>Rename</span>
              <MenuShortcut>F2</MenuShortcut>
            </MenuBase.Item>
            <MenuBase.Item className={menuItemClassName} onClick={onCopy}>
              <CopyIcon className="size-3.5 shrink-0" />
              <span>Copy</span>
              <MenuShortcut>{`${actionModifierLabel}C`}</MenuShortcut>
            </MenuBase.Item>
            <MenuBase.Item className={menuItemClassName} onClick={onCut}>
              <ScissorsIcon className="size-3.5 shrink-0" />
              <span>Cut</span>
              <MenuShortcut>{`${actionModifierLabel}X`}</MenuShortcut>
            </MenuBase.Item>
            <MenuBase.Item
              className={menuItemClassName}
              disabled={!canPaste}
              onClick={onPaste}
            >
              <ClipboardPasteIcon className="size-3.5 shrink-0" />
              <span>Paste</span>
              <MenuShortcut>{`${actionModifierLabel}V`}</MenuShortcut>
            </MenuBase.Item>
            <MenuBase.Item
              className={cn(menuItemClassName, 'text-error-foreground')}
              onClick={onDelete}
            >
              <Trash2Icon className="size-3.5 shrink-0" />
              <span>Delete</span>
              <MenuShortcut>Del</MenuShortcut>
            </MenuBase.Item>
            <MenuBase.Separator className="my-0.5 h-px bg-border-subtle" />
            <MenuBase.Item className={menuItemClassName} onClick={onReveal}>
              <FolderOpenIcon className="size-3.5 shrink-0" />
              <span>Open in {nativeFileManagerLabel}</span>
            </MenuBase.Item>
          </MenuBase.Popup>
        </MenuBase.Positioner>
      </MenuBase.Portal>
    </ContextMenu.Root>
  );
});

function TreeNodeIcon({
  entry,
  expanded,
  loading,
}: {
  entry: FileTreeEntry;
  expanded: boolean;
  loading?: boolean;
}) {
  const isDirectory = entry.kind === 'directory';
  return (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {isDirectory ? (
          loading ? (
            <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
          ) : (
            <ChevronRightIcon
              className={cn(
                'size-3 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          )
        ) : null}
      </span>
      {isDirectory ? (
        <FolderIcon className="m-[0.0625rem] size-3.5 shrink-0 text-[oklch(0.72_0.09_78)]" />
      ) : (
        <FileIcon filePath={entry.name} className="size-4" />
      )}
    </>
  );
}

function RenameRow({
  entry,
  depth,
  expanded,
  loading,
  rowIndex,
  onSubmit,
  onCancel,
}: {
  entry: FileTreeEntry;
  depth: number;
  expanded: boolean;
  loading?: boolean;
  rowIndex: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const value = inputRef.current?.value.trim() ?? '';
    if (!value || value === entry.name) {
      onCancel();
      return;
    }
    onSubmit(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="flex h-6 w-full items-center gap-1 rounded px-1 text-xs"
      data-file-tree-entry-path={entry.relativePath}
      data-file-tree-row-index={rowIndex}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      <TreeNodeIcon entry={entry} expanded={expanded} loading={loading} />
      <input
        ref={inputRef}
        className="h-5 min-w-0 flex-1 rounded-sm border border-primary-solid bg-background px-1 text-foreground outline-none"
        defaultValue={entry.name}
        onBlur={submit}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </div>
  );
}
