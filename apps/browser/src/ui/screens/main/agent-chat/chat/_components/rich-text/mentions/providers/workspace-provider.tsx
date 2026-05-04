import { IconFolder5Outline18 } from 'nucleo-ui-outline-18';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { MentionProvider, MentionContext } from './types';
import type { WorkspaceMentionItem } from '../types';
import { getBaseName } from '@shared/path-utils';

export const workspaceProvider: MentionProvider = {
  type: 'workspace',
  groupLabel: 'Workspaces',
  boost: 0.8,
  icon: ({ className }) => (
    <IconFolder5Outline18 className={cn('size-2.5 shrink-0', className)} />
  ),
  query: (_input: string, ctx: MentionContext): WorkspaceMentionItem[] => {
    return ctx.mounts.map((mount) => {
      const name = getBaseName(mount.path) || mount.path;
      return {
        id: mount.prefix,
        label: name,
        description: mount.path,
        descriptionTruncation: 'start' as const,
        providerType: 'workspace' as const,
        relevance: 0.4,
        meta: {
          providerType: 'workspace' as const,
          prefix: mount.prefix,
          name,
          path: mount.path,
        },
      };
    });
  },
};
