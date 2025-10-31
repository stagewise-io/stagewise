import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIBase } from './_shared';
import { SearchIcon } from 'lucide-react';

export const GlobToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-globTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<SearchIcon className="size-3" />}
      toolName={`Searching with Glob...`}
      toolSubtitle={part.input?.pattern}
    />
  );
};
