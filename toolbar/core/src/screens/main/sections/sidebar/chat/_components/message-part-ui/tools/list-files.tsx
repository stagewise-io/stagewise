import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIReadOnly } from './_shared';
import { getTruncatedFileUrl } from '@/utils';

export const ListFilesToolPart = ({
  part,
  shimmer = false,
}: {
  part: Extract<ToolPart, { type: 'tool-listFilesTool' }>;
  shimmer?: boolean;
}) => {
  const streamingText = part.input?.includeDirectories
    ? 'Listing directories...'
    : 'Listing files...';
  const finishedText =
    part.state === 'output-available' ? (
      <>
        <span className="font-semibold">Listed </span>
        <span className="font-normal">
          {part.output?.result?.totalFiles}{' '}
          {part.input?.includeDirectories ? 'directories' : 'files'}
        </span>
        {part.input?.relative_path && (
          <span className="font-normal">
            {' '}
            in {getTruncatedFileUrl(part.input.relative_path)}
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
