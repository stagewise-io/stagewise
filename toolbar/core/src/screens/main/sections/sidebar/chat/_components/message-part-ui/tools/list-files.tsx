import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { getTruncatedFileUrl } from '@/utils';
import { FolderOpenIcon } from 'lucide-react';

export const ListFilesToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-listFilesTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.includeDirectories
    ? 'Listing directories...'
    : 'Listing files...';
  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-semibold">Listed </span>
        <span className="truncate font-normal">
          {part.output?.result?.totalFiles}{' '}
          {part.input?.includeDirectories ? 'directories' : 'files'}
          {part.input?.relative_path && (
            <> in {getTruncatedFileUrl(part.input.relative_path)}</>
          )}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<FolderOpenIcon className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
