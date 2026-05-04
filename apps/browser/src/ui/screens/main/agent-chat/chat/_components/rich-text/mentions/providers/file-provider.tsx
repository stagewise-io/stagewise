import { FileIcon } from '@ui/components/file-icon';
import { IconFolder5Outline18 } from 'nucleo-ui-outline-18';
import type { MentionProvider, MentionContext } from './types';
import type { FileMentionItem } from '../types';
import type { MentionFileCandidate } from '@shared/karton-contracts/ui/agent/metadata';
import { cn } from '@ui/utils';

function relevanceFromReason(
  reason: MentionFileCandidate['relevanceReason'],
): number {
  switch (reason) {
    case 'pending-diff':
      return 1.0;
    case 'edit-summary':
      return 0.8;
    case 'search-match':
      return 0.5;
    default:
      return 0.3;
  }
}

export const fileProvider: MentionProvider = {
  type: 'file',
  groupLabel: 'Files',
  boost: 1.3,
  icon: ({ id, className }) => {
    if (id.endsWith('/')) {
      return <IconFolder5Outline18 className={cn(className, 'size-2.5')} />;
    }
    return (
      <FileIcon filePath={id} className={cn(className, '-m-0.5 size-4')} />
    );
  },
  query: async (
    input: string,
    ctx: MentionContext,
  ): Promise<FileMentionItem[]> => {
    if (!ctx.searchFiles || !ctx.agentInstanceId) return [];
    const candidates = await ctx.searchFiles(ctx.agentInstanceId, input);
    return candidates.map((c) => {
      const isDir = !!c.isDirectory;
      return {
        id: isDir ? `${c.mountedPath}/` : c.mountedPath,
        label: isDir ? `${c.fileName}/` : c.fileName,
        description: c.relativePath.slice(
          0,
          c.relativePath.length - c.fileName.length,
        ),
        descriptionTruncation: 'start' as const,
        searchText: isDir
          ? input.includes('/')
            ? c.relativePath
            : c.fileName
          : c.relativePath,
        providerType: 'file' as const,
        relevance: relevanceFromReason(c.relevanceReason),
        meta: {
          providerType: 'file' as const,
          mountedPath: c.mountedPath,
          relativePath: c.relativePath,
          mountPrefix: c.mountPrefix,
          fileName: c.fileName,
          isDirectory: isDir || undefined,
        },
      };
    });
  },
};
