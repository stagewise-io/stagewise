import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIReadOnly } from './_shared';
import { getTruncatedFileUrl } from '@/utils';

export const ReadFileToolPart = ({
  part,
  shimmer = false,
}: {
  part: Extract<ToolPart, { type: 'tool-readFileTool' }>;
  shimmer?: boolean;
}) => {
  const streamingText = part.input?.relative_path
    ? `Reading ${getTruncatedFileUrl(part.input?.relative_path ?? '')}...`
    : 'Reading file...';

  const finishedText =
    part.state === 'output-available' ? (
      <>
        <span className="font-semibold">Read </span>
        <span className="font-normal">
          {getTruncatedFileUrl(part.input?.relative_path ?? '')}
        </span>
        {part.output?.result?.linesRead && (
          <span className="font-normal">
            {' '}
            ({part.output?.result?.linesRead} lines)
          </span>
        )}
      </>
    ) : undefined;

  return (
    <ToolPartUIReadOnly
      part={part}
      shimmer={shimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
