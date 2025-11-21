import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIReadOnly } from './_shared';

export const GrepSearchToolPart = ({
  part,
  shimmer = false,
}: {
  part: Extract<ToolPart, { type: 'tool-grepSearchTool' }>;
  shimmer?: boolean;
}) => {
  const streamingText = part.input?.query
    ? `Searching for ${part.input?.query}...`
    : `Searching with grep...`;
  const finishedText =
    part.state === 'output-available' ? (
      <>
        <span className="font-semibold">Found </span>
        <span className="font-normal">
          {part.output?.result?.totalMatches ?? 0} result
          {part.output?.result?.totalMatches !== 1 ? 's' : ''}
        </span>
        {part.input?.query && (
          <>
            {' '}
            for <span className="font-normal">"{part.input.query}"</span>
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
