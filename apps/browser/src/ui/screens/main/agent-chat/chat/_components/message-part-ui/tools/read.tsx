import { useMemo } from 'react';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import {
  IconEyeOutline18,
  IconBookOpenOutline18,
  IconBugOutline18,
  IconTerminalOutline18,
  IconVersionsOutline18,
} from 'nucleo-ui-outline-18';
import { cn, resolveDisplayPath } from '@ui/utils';
import { useAttachmentMetadata } from '@ui/hooks/use-attachment-metadata';
import { useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { isLogPath, LOGS_PREFIX } from '@stagewise/agent-core/logs';

const PLUGIN_SKILL_RE = /^plugins\/([^/]+)\/SKILL\.md$/;
const WORKSPACE_SKILL_RE =
  /^[^/]+\/\.(?:stagewise|agents)\/skills\/([^/]+)\/SKILL\.md$/;
const SHELL_LOG_RE = /^shells\/[^/]+\.shell\.log$/;
const MEMORY_RE = /^memory(?:\/|$)/;
const AGENT_MEMORY_RE = /^memory\/agents\/([^/]+)\/([^/]+)$/;

function getMemoryReadLabel(
  relativePath: string,
  currentAgentId: string | null,
): string {
  if (
    relativePath === 'memory/index.md' ||
    relativePath === 'memory/index.json'
  ) {
    return 'index';
  }

  const match = relativePath.match(AGENT_MEMORY_RE);
  if (!match) return 'file';

  const [, agentId, filename] = match;
  const subject = agentId === currentAgentId ? '' : ` of ${agentId}`;

  if (filename === 'metadata.json') return `metadata${subject}`;
  if (filename === 'history.md' || filename === 'history.jsonl') {
    return `content${subject}`;
  }

  return `file${subject}`;
}

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
  const [openAgent] = useOpenAgent();
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

  const logChannelName = useMemo(() => {
    if (!isLogPath(relativePath)) return null;
    return relativePath
      .replace(new RegExp(`^${LOGS_PREFIX}/`), '')
      .replace(/\.jsonl$/, '');
  }, [relativePath]);

  const isShellLog = useMemo(
    () => SHELL_LOG_RE.test(relativePath),
    [relativePath],
  );

  const isMemoryPath = useMemo(
    () => MEMORY_RE.test(relativePath),
    [relativePath],
  );

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

  if (logChannelName) {
    const streamingText = `Reading log ${logChannelName}…`;

    const finishedText =
      part.state === 'output-available' ? (
        <span className="flex min-w-0 gap-1">
          <span className="shrink-0 font-medium">Read log</span>
          <span className="truncate font-normal opacity-75">
            {logChannelName}
          </span>
        </span>
      ) : undefined;

    return (
      <ToolPartUINotCollapsible
        icon={<IconBugOutline18 className="size-3 shrink-0" />}
        part={part}
        minimal={minimal}
        disableShimmer={disableShimmer}
        streamingText={streamingText}
        finishedText={finishedText}
      />
    );
  }

  if (isShellLog) {
    const streamingText = 'Reading shell output...';

    const finishedText =
      part.state === 'output-available' ? (
        <span className="flex min-w-0 gap-1">
          <span className="shrink-0 font-medium">Read shell output</span>
        </span>
      ) : undefined;

    return (
      <ToolPartUINotCollapsible
        icon={<IconTerminalOutline18 className="size-3 shrink-0" />}
        part={part}
        minimal={minimal}
        disableShimmer={disableShimmer}
        streamingText={streamingText}
        finishedText={finishedText}
      />
    );
  }

  if (isMemoryPath) {
    const memoryReadLabel = getMemoryReadLabel(relativePath, openAgent);
    const streamingText = `Reading memory ${memoryReadLabel}...`;

    const finishedText =
      part.state === 'output-available' ? (
        <span className="flex min-w-0 gap-1">
          <span className="shrink-0 font-medium">Read memory</span>
          <span className="truncate font-normal opacity-75">
            {memoryReadLabel}
          </span>
        </span>
      ) : undefined;

    return (
      <ToolPartUINotCollapsible
        icon={<IconVersionsOutline18 className="size-3 shrink-0" />}
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
