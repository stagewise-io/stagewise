import { useMemo } from 'react';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { CopyIcon, ScissorsIcon } from 'lucide-react';
import { resolveDisplayPath } from '@ui/utils';
import { useAttachmentMetadata } from '@ui/hooks/use-attachment-metadata';

export const CopyToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-copy' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const inputPath = part.input?.input_path ?? '';
  const outputPath = part.input?.output_path ?? '';
  const isMove = part.input?.move ?? false;

  const attachmentMetadata = useAttachmentMetadata();

  const displayInputPath = inputPath
    ? resolveDisplayPath(inputPath, attachmentMetadata)
    : undefined;
  const displayOutputPath = outputPath
    ? resolveDisplayPath(outputPath, attachmentMetadata)
    : undefined;

  const icon = isMove ? (
    <ScissorsIcon className="size-3 shrink-0" />
  ) : (
    <CopyIcon className="size-3 shrink-0" />
  );

  const action = isMove ? 'Moving' : 'Copying';
  const actionPast = isMove ? 'Moved' : 'Copied';

  const streamingText = useMemo(() => {
    if (displayInputPath && displayOutputPath) {
      return `${action} ${displayInputPath} → ${displayOutputPath}...`;
    }
    return `${action}...`;
  }, [displayInputPath, displayOutputPath, action]);

  const finishedText = useMemo(() => {
    if (part.state !== 'output-available') return undefined;
    return (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 font-medium">{actionPast}</span>
        <span className="truncate font-normal opacity-75">
          {displayInputPath ?? ''} → {displayOutputPath ?? ''}
        </span>
      </span>
    );
  }, [part.state, actionPast, displayInputPath, displayOutputPath]);

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
};
