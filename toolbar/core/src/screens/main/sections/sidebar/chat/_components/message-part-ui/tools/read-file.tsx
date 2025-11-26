import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { EyeIcon } from 'lucide-react';

export const ReadFileToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-readFileTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.relative_path ? (
    <span className="flex min-w-0 gap-1">
      <span className="truncate">Reading {part.input.relative_path}...</span>
    </span>
  ) : (
    'Reading file...'
  );

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-semibold">Read </span>
        <span className="truncate font-normal">
          {part.input?.relative_path ?? ''}
          {part.output?.result?.linesRead && (
            <> ({part.output?.result?.linesRead} lines)</>
          )}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<EyeIcon className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
