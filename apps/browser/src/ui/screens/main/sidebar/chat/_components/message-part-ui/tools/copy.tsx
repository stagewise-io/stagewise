import { useMemo } from 'react';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import {
  IconClone2Outline18,
  IconCloneDashed2Outline18,
  IconFilePenOutline18,
  IconFolderPenOutline18,
} from 'nucleo-ui-outline-18';
import { resolveDisplayPath } from '@ui/utils';
import { useAttachmentMetadata } from '@ui/hooks/use-attachment-metadata';
import { getBaseName, getParentPath } from '@shared/path-utils';

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

  // Detect rename: move mode where only the final name differs (same parent directory)
  const isRename = useMemo(() => {
    if (!isMove || !inputPath || !outputPath) return false;
    return getParentPath(inputPath) === getParentPath(outputPath);
  }, [isMove, inputPath, outputPath]);

  // Heuristic: paths whose final segment has no dot are directories
  const isFolder = useMemo(() => {
    const name = getBaseName(inputPath);
    return name.length > 0 && !name.includes('.');
  }, [inputPath]);

  const icon = isRename ? (
    isFolder ? (
      <IconFolderPenOutline18 className="size-3 shrink-0" />
    ) : (
      <IconFilePenOutline18 className="size-3 shrink-0" />
    )
  ) : isMove ? (
    <IconCloneDashed2Outline18 className="size-3 shrink-0" />
  ) : (
    <IconClone2Outline18 className="size-3 shrink-0" />
  );

  const action = isRename ? 'Renaming' : isMove ? 'Moving' : 'Copying';
  const actionPast = isRename ? 'Renamed' : isMove ? 'Moved' : 'Copied';

  const streamingText = useMemo(() => {
    if (displayInputPath && displayOutputPath) {
      return `${action} ${displayInputPath} → ${displayOutputPath}...`;
    }
    return `${action}...`;
  }, [displayInputPath, displayOutputPath, isRename, isMove]);

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
  }, [part.state, isRename, isMove, displayInputPath, displayOutputPath]);

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
