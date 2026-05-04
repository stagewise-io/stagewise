import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { IconBooks2Outline18 } from 'nucleo-ui-outline-18';

export const ListLibraryDocsToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-listLibraryDocs' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.name
    ? `Searching latest docs for ${part.input.name}...`
    : 'Searching latest docs...';

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-semibold">Found</span>
        <span className="truncate font-normal">
          {part.output?.results.length ?? 0} docs for {part.input?.name}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<IconBooks2Outline18 className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
