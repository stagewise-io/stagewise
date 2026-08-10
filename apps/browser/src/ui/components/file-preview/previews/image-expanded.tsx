import type { FilePreviewProps } from '../types';
import { cn } from '@ui/utils';
import { useOpenImageTab } from '@ui/hooks/use-open-image-tab';

export default function ImageExpanded({
  src,
  fileName,
  mediaType,
  className,
}: FilePreviewProps) {
  const openImageTab = useOpenImageTab();

  return (
    <button
      type="button"
      className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid"
      aria-label={`Open ${fileName} in tab`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        openImageTab(fileName, src, mediaType);
      }}
    >
      <img
        src={src}
        alt={fileName}
        className={cn('max-h-56 max-w-72 rounded object-contain', className)}
      />
    </button>
  );
}
