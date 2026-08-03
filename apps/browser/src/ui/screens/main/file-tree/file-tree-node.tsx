import {
  FileTreeNodeIcon,
  FileTreeNodeRow,
} from '@ui/components/file-tree-node-row';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import type { FileTreeEntry } from '@shared/karton-contracts/ui';
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
  const folderPath = entry.relativePath.includes('/')
    ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
    : '';

  if (renaming) {
    return (
      <RenameRow
        entry={entry}
        depth={depth}
        expanded={expanded}
        loading={loading}
        rowIndex={rowIndex}
        onSubmit={onRenameSubmit}
        onCancel={onRenameCancel}
      />
    );
  }

  const button = (
    <FileTreeNodeRow
      kind={entry.kind}
      name={entry.name}
      depth={depth}
      expanded={expanded}
      loading={loading}
      selected={selected}
      muted={entry.isIgnored}
      cut={cut}
      dropTarget={dropTarget}
      data-file-tree-entry-path={entry.relativePath}
      data-file-tree-row-index={rowIndex}
      tabIndex={focused ? 0 : -1}
      draggable
      onContextMenu={onFocus}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
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
      onFocus={onFocus}
    />
  );

  // Only files get the rich name/path tooltip; directories keep no tooltip.
  if (isDirectory) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" align="start">
        <div className="flex flex-col">
          <span className="font-medium">{entry.name}</span>
          {folderPath && (
            <span className="text-muted-foreground">{folderPath}</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

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
      <FileTreeNodeIcon
        kind={entry.kind}
        name={entry.name}
        expanded={expanded}
        loading={loading}
      />
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
