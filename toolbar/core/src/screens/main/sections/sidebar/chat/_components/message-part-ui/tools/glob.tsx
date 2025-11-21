import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIReadOnly } from './_shared';

export const GlobToolPart = ({
  part,
  shimmer = false,
}: {
  part: Extract<ToolPart, { type: 'tool-globTool' }>;
  shimmer?: boolean;
}) => {
  const streamingText = part.input?.pattern
    ? `Searching for ${part.input?.pattern}...`
    : `Searching files...`;

  const finishedText =
    part.state === 'output-available' ? (
      <>
        <span className="font-semibold">Found </span>
        <span className="font-normal">
          {part.output?.result?.totalMatches ?? 0} file
          {part.output?.result?.totalMatches !== 1 ? 's' : ''}
        </span>
        {part.input?.pattern && (
          <>
            {' '}
            matching <span className="font-normal">"{part.input.pattern}"</span>
          </>
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
