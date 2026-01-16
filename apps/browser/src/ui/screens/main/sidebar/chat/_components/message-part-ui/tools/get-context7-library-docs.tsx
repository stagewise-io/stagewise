import type { ToolPart } from '@shared/karton-contracts/ui';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { FolderCode } from 'lucide-react';

export const GetContext7LibraryDocsToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-getContext7LibraryDocsTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.libraryId
    ? `Reading latest docs for ${part.input.libraryId}...`
    : 'Reading latest docs...';

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-medium">Read latest docs</span>
        {part.input?.libraryId && (
          <span className="truncate font-normal opacity-75">
            for {part.input.libraryId}
          </span>
        )}
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<FolderCode className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
