import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIBase } from './_shared';
import { EyeIcon } from 'lucide-react';
import { getTruncatedFileUrl } from '@/utils';

export const ReadFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-readFileTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<EyeIcon className="size-3" />}
      toolName={`Reading file...`}
      toolSubtitle={getTruncatedFileUrl(part.input?.relative_path ?? '')}
    />
  );
};
