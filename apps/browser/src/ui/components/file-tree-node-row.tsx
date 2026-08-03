import { FileIcon } from '@ui/components/file-icon';
import { cn } from '@ui/utils';
import type { FileTreeNodeKind } from '@shared/karton-contracts/ui';
import { ChevronRightIcon, FolderIcon, Loader2Icon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type FileTreeNodeRowProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  kind: FileTreeNodeKind;
  name: string;
  depth: number;
  expanded?: boolean;
  loading?: boolean;
  selected?: boolean;
  muted?: boolean;
  cut?: boolean;
  dropTarget?: boolean;
  trailing?: ReactNode;
};

export const FileTreeNodeRow = forwardRef<
  HTMLButtonElement,
  FileTreeNodeRowProps
>(function FileTreeNodeRow(
  {
    kind,
    name,
    depth,
    expanded = false,
    loading,
    selected,
    muted,
    cut,
    dropTarget,
    trailing,
    className,
    style,
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-6 w-full select-none items-center gap-1 rounded px-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid focus-visible:ring-inset',
        muted ? 'text-muted-foreground opacity-45' : 'text-foreground',
        selected ? 'hover:bg-foreground/[0.06]' : 'hover:bg-hover-derived',
        cut && 'opacity-45',
        dropTarget && 'bg-primary-solid/15 ring-1 ring-primary-solid/50',
        className,
      )}
      style={{ ...style, paddingLeft: 4 + depth * 14 }}
      aria-expanded={kind === 'directory' ? expanded : undefined}
      {...buttonProps}
    >
      <FileTreeNodeIcon
        kind={kind}
        name={name}
        expanded={expanded}
        loading={loading}
      />
      <span className="min-w-0 truncate">{name}</span>
      {trailing ? (
        <span className="ml-auto flex shrink-0 items-center pl-3">
          {trailing}
        </span>
      ) : null}
    </button>
  );
});

export function FileTreeNodeIcon({
  kind,
  name,
  expanded,
  loading,
}: {
  kind: FileTreeNodeKind;
  name: string;
  expanded: boolean;
  loading?: boolean;
}) {
  const isDirectory = kind === 'directory';
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
        <FileIcon filePath={name} className="size-4" />
      )}
    </>
  );
}
