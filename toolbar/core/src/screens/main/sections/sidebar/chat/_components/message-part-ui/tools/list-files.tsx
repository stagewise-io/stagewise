import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUIBase } from './_shared';
import { ListIcon } from 'lucide-react';
import { getTruncatedFileUrl } from '@/utils';

export const ListFilesToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-listFilesTool' }>;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<ListIcon className="size-3" />}
      toolName={`Listing ${part.input ? (part.input.includeDirectories ? 'directories' : 'files') : ''}...`}
      toolSubtitle={
        part.input?.relative_path &&
        `Looking in ${getTruncatedFileUrl(part.input.relative_path)}`
      }
    />
  );
};
