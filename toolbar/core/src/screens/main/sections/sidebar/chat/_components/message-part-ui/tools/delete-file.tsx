import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIBase } from './_shared';
import { TrashIcon } from 'lucide-react';

export const DeleteFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-deleteFileTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<TrashIcon className="size-3" />}
      toolName={`Deleting file...`}
      toolSubtitle={part.input?.relative_path}
    />
  );
};
