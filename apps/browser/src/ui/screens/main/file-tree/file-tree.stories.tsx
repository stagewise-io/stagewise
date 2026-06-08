import type { Meta, StoryObj } from '@storybook/react';
import type { FileTreeEntry } from '@shared/karton-contracts/ui';
import { FileTreeRowView } from './file-tree-workspace-view';
import type { FileTreeRow } from './use-file-tree-entries';

function entry(
  name: string,
  relativePath: string,
  kind: FileTreeEntry['kind'] = 'file',
): FileTreeEntry {
  return {
    name,
    relativePath,
    kind,
    size: kind === 'file' ? 1024 : null,
    mtimeMs: Date.now(),
    mimeType: kind === 'file' ? 'text/plain' : null,
    isIgnored: false,
    hasChildren: kind === 'directory',
  };
}

const rows: FileTreeRow[] = [
  {
    type: 'entry',
    id: 'src',
    entry: entry('src', 'src', 'directory'),
    depth: 0,
    expanded: true,
    loading: false,
  },
  {
    type: 'entry',
    id: 'src/ui',
    entry: entry('ui', 'src/ui', 'directory'),
    depth: 1,
    expanded: true,
    loading: false,
  },
  {
    type: 'entry',
    id: 'src/ui/app.tsx',
    entry: entry('app.tsx', 'src/ui/app.tsx'),
    depth: 2,
    expanded: false,
    loading: false,
  },
  {
    type: 'entry',
    id: 'src/ui/index.ts',
    entry: entry('index.ts', 'src/ui/index.ts'),
    depth: 2,
    expanded: false,
    loading: false,
  },
  {
    type: 'entry',
    id: 'package.json',
    entry: entry('package.json', 'package.json'),
    depth: 0,
    expanded: false,
    loading: false,
  },
];

function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-96 w-80 overflow-hidden border border-border bg-background p-1">
      {children}
    </div>
  );
}

function RowsStory({ storyRows }: { storyRows: FileTreeRow[] }) {
  return (
    <StoryShell>
      <div className="flex flex-col gap-0.5">
        {storyRows.map((row, index) => (
          <FileTreeRowView
            key={row.id}
            row={row}
            selected={row.id === 'src/ui/app.tsx' || row.id === 'file-2.ts'}
            focused={false}
            rowIndex={index}
            dragPath={row.id}
            dragPayload=""
            dragFilePaths={[]}
            onFocus={() => undefined}
            onToggle={() => undefined}
            onSelect={() => undefined}
            onSelectPointerDown={() => undefined}
            onOpen={() => undefined}
            cut={false}
            dropTarget={false}
            renaming={false}
            onRenameSubmit={() => undefined}
            onRenameCancel={() => undefined}
            onMoveDrop={() => undefined}
            onDragTargetChange={() => undefined}
            onLoadMore={() => undefined}
          />
        ))}
      </div>
    </StoryShell>
  );
}

function EmptyStory() {
  return (
    <StoryShell>
      <div className="px-3 py-6 text-center text-muted-foreground text-xs">
        No mounted workspaces.
      </div>
    </StoryShell>
  );
}

function WorkspaceTabsStory() {
  return (
    <StoryShell>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-border border-b p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="rounded-md bg-surface-1 px-2 py-1 text-foreground text-xs"
        >
          browser
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-muted-foreground text-xs"
        >
          stage-ui
        </button>
      </div>
      <div className="pt-1">
        <RowsStory storyRows={rows.slice(0, 3)} />
      </div>
    </StoryShell>
  );
}

const meta = {
  title: 'Main/FileTree',
  component: RowsStory,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof RowsStory>;

export default meta;

type Story = StoryObj<typeof RowsStory>;

export const EmptyWorkspaceList: StoryObj<typeof EmptyStory> = {
  render: () => <EmptyStory />,
};

export const WorkspaceTabs: StoryObj<typeof WorkspaceTabsStory> = {
  render: () => <WorkspaceTabsStory />,
};

export const DeepExpandedTree: Story = {
  args: {
    storyRows: rows,
  },
};

export const LoadingAndErrorRows: Story = {
  args: {
    storyRows: [
      {
        type: 'entry',
        id: 'src',
        entry: entry('src', 'src', 'directory'),
        depth: 0,
        expanded: true,
        loading: true,
      },
      { type: 'loading', id: 'src/loading', depth: 1 },
      {
        type: 'error',
        id: 'src/error',
        message: 'Failed to load directory',
        depth: 1,
      },
    ],
  },
};

export const LargePaginatedDirectory: Story = {
  args: {
    storyRows: [
      ...Array.from(
        { length: 40 },
        (_, index): FileTreeRow => ({
          type: 'entry',
          id: `file-${index}.ts`,
          entry: entry(`file-${index}.ts`, `file-${index}.ts`),
          depth: 0,
          expanded: false,
          loading: false,
        }),
      ),
      {
        type: 'load-more',
        id: ':load-more',
        directoryPath: '',
        depth: 0,
      },
    ],
  },
};
