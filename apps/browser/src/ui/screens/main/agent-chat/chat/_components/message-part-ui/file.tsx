import { FileIcon, ImageIcon } from 'lucide-react';
import { openFileUrl } from '@ui/utils';
import type { FileUIPart } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import { useOpenImageTab } from '@ui/hooks/use-open-image-tab';

export const FilePart = ({ part }: { part: FileUIPart }) => {
  const openImageTab = useOpenImageTab();
  const isImage = part.mediaType.startsWith('image/');
  const fileName = part.filename ?? 'Generated file';

  return (
    <div className="-mx-1 rounded-xl">
      <Button
        variant="ghost"
        size="xs"
        data-image={isImage}
        className="group/file-part flex h-auto w-full flex-col items-center gap-1 rounded-xl text-foreground"
        onClick={() => {
          if (isImage) openImageTab(fileName, part.url, part.mediaType);
          else void openFileUrl(part.url, part.filename);
        }}
      >
        <div className="flex w-full shrink-0 flex-row items-center justify-start gap-1.5 group-data-[image=true]/file-part:text-muted-foreground">
          {isImage ? (
            <ImageIcon className="size-3" />
          ) : (
            <FileIcon className="size-3" />
          )}
          <span className="flex-1 text-start text-xs">{fileName}</span>
        </div>
        {isImage ? (
          <img
            src={part.url}
            alt={fileName}
            className="m-1 w-max rounded object-cover"
          />
        ) : null}
      </Button>
    </div>
  );
};
