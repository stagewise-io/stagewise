import { useMemo } from 'react';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { IconEyeOutline18 } from 'nucleo-ui-outline-18';
import { IconBookOpenOutline18 } from 'nucleo-ui-outline-18';
import { cn, resolveDisplayPath } from '@ui/utils';
import { useAttachmentMetadata } from '@ui/hooks/use-attachment-metadata';
import { useKartonState } from '@ui/hooks/use-karton';

const PLUGIN_SKILL_RE = /^plugins\/([^/]+)\/SKILL\.md$/;
const WORKSPACE_SKILL_RE =
  /^[^/]+\/\.(?:stagewise|agents)\/skills\/([^/]+)\/SKILL\.md$/;

export const ReadToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-read' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const plugins = useKartonState((s) => s.plugins);
  const relativePath = part.input?.path ?? '';

  const pluginMatch = useMemo(() => {
    const match = relativePath.match(PLUGIN_SKILL_RE);
    if (!match) return null;
    const plugin = plugins.find((p) => p.id === match[1]);
    return plugin ?? null;
  }, [relativePath, plugins]);

  const workspaceSkillName = useMemo(() => {
    const match = relativePath.match(WORKSPACE_SKILL_RE);
    return match?.[1] ?? null;
  }, [relativePath]);

  const attachmentMetadata = useAttachmentMetadata();
  const displayPath = relativePath
    ? resolveDisplayPath(relativePath, attachmentMetadata)
    : undefined;

  if (pluginMatch) {
    const streamingText = `Enabling ${pluginMatch.displayName}...`;

    const finishedText =
      part.state === 'output-available' ? (
        <span className="flex min-w-0 gap-1">
          <span className="shrink-0 font-medium">Enabled</span>
          <span className="truncate font-normal opacity-75">
            {pluginMatch.displayName}
          </span>
        </span>
      ) : undefined;

    const icon = pluginMatch.logoSvg ? (
      <div
        className={cn(
          'size-3 shrink-0 overflow-hidden text-foreground [&>svg]:size-full',
        )}
        dangerouslySetInnerHTML={{ __html: pluginMatch.logoSvg }}
      />
    ) : (
      <IconEyeOutline18 className="size-3 shrink-0" />
    );

    return (
      <ToolPartUINotCollapsible
        icon={icon}
        part={part}
        minimal={minimal}
        disableShimmer={disableShimmer}
        streamingText={streamingText}
        finishedText={finishedText}
      />
    );
  }

  if (workspaceSkillName) {
    const streamingText = `Enabling ${workspaceSkillName}...`;

    const finishedText =
      part.state === 'output-available' ? (
        <span className="flex min-w-0 gap-1">
          <span className="shrink-0 font-medium">Enabled</span>
          <span className="truncate font-normal opacity-75">
            {workspaceSkillName}
          </span>
        </span>
      ) : undefined;

    return (
      <ToolPartUINotCollapsible
        icon={<IconBookOpenOutline18 className="size-3 shrink-0" />}
        part={part}
        minimal={minimal}
        disableShimmer={disableShimmer}
        streamingText={streamingText}
        finishedText={finishedText}
      />
    );
  }

  const streamingText = displayPath
    ? `Reading ${displayPath}...`
    : 'Reading file...';

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-medium">Read </span>
        <span className="truncate font-normal opacity-75">
          {displayPath ?? ''}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<IconEyeOutline18 className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
