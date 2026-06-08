import { FileIcon } from '@ui/components/file-icon';
import { cn } from '@ui/utils';
import type { FileTreeEntry } from '@shared/karton-contracts/ui';
import { ChevronRightIcon, FolderIcon, Loader2Icon } from 'lucide-react';
import {
  memo,
  useEffect,
  useRef,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

type FileTreeNodeProps = {
  entry: FileTreeEntry;
  depth: number;
  expanded: boolean;
  focused: boolean;
  loading?: boolean;
  rowIndex: number;
  dragPath: string;
  dragPayload: string;
  dragFilePaths: string[];
  selected: boolean;
  cut: boolean;
  dropTarget: boolean;
  renaming: boolean;
  onFocus: () => void;
  onToggle: () => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onSelectPointerDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
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
  dragFilePaths,
  selected,
  cut,
  dropTarget,
  renaming,
  onFocus,
  onSelect,
  onSelectPointerDown,
  onOpen,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onRenameSubmit,
  onRenameCancel,
}: FileTreeNodeProps) {
  const isDirectory = entry.kind === 'directory';

  return renaming ? (
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
        'flex h-6 w-full select-none items-center gap-1 rounded px-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid focus-visible:ring-inset',
        entry.isIgnored
          ? 'text-muted-foreground opacity-45'
          : 'text-foreground',
        // When the row is already selected, darken the selection background on
        // hover (translucent overlay blends with the selected bg behind it)
        // instead of replacing it with the neutral gray hover.
        selected ? 'hover:bg-foreground/[0.06]' : 'hover:bg-hover-derived',
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
        // Carry every selected file path so dropping a multi-selection into
        // the chat input attaches all of them, not just the dragged file.
        if (dragFilePaths.length > 0) {
          event.dataTransfer.setData(
            'application/x-stagewise-file-paths',
            JSON.stringify(dragFilePaths),
          );
        }
        event.dataTransfer.setData(
          'text/plain',
          dragFilePaths.length > 1
            ? dragFilePaths.map((p) => `[](path:${p})`).join(' ')
            : `[](path:${dragPath})`,
        );
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') onSelectPointerDown(event);
      }}
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
