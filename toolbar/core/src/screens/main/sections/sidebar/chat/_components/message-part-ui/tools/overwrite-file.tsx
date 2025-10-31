import type { ToolPart } from '@stagewise/karton-contract';
import { DiffPreview, ToolPartUIBase } from './_shared';
import { PencilIcon } from 'lucide-react';

export const OverwriteFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-overwriteFileTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<PencilIcon className="size-3" />}
      toolName={`Overwriting file...`}
      toolSubtitle={part.input?.path}
      collapsedContent={
        part.input &&
        part.output && (
          <DiffPreview
            filePath={part.input?.path}
            before={''}
            after={part.input.content}
          />
        )
      }
    />
  );
};
