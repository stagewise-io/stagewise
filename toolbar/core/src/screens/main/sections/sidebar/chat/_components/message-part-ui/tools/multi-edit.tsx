import type { ToolPart } from '@stagewise/karton-contract';
import { DiffPreview, ToolPartUIBase } from './_shared';
import { PencilIcon } from 'lucide-react';

export const MultiEditToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-multiEditTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<PencilIcon className="size-3" />}
      toolName={`Editing file...`}
      toolSubtitle={part.input?.file_path}
      collapsedContent={
        part.output &&
        'hiddenMetadata' in part.output &&
        part.output.hiddenMetadata?.diff &&
        (!part.output.hiddenMetadata.diff.afterOmitted &&
        !part.output.hiddenMetadata.diff.beforeOmitted ? (
          <DiffPreview
            filePath={part.input?.file_path}
            before={part.output.hiddenMetadata.diff.before}
            after={part.output.hiddenMetadata.diff.after}
          />
        ) : (
          <span>Diff content omitted (file too large)</span>
        ))
      }
    />
  );
};
