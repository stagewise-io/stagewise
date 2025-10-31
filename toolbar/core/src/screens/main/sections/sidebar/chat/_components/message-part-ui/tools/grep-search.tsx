import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIBase } from './_shared';
import { SearchIcon } from 'lucide-react';

export const GrepSearchToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-grepSearchTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<SearchIcon className="size-3" />}
      toolName={`Searching with Grep...`}
      toolSubtitle={part.input?.query}
    />
  );
};
