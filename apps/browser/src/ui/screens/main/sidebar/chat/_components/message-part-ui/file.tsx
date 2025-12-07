import { FileIcon, ImageIcon, ExternalLinkIcon } from 'lucide-react';
import { openFileUrl } from '@/utils';
import type { FileUIPart } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';

export const FilePart = ({ part }: { part: FileUIPart }) => {
  const isImage = part.mediaType.startsWith('image/');

  return (
    <div className="-mx-1 rounded-xl bg-muted-foreground/5">
      <Button
        variant="ghost"
        size="xs"
        data-image={isImage}
        className="group/file-part flex w-full flex-col items-center gap-1 rounded-xl data-[image=false]:h-6 data-[image=true]:h-fit"
        onClick={() => {
          void openFileUrl(part.url, part.filename);
        }}
      >
        <div className="flex w-full shrink-0 flex-row items-center justify-start gap-1.5 group-data-[image=true]/file-part:text-muted-foreground">
          {isImage ? (
            <ImageIcon className="size-3" />
          ) : (
            <FileIcon className="size-3" />
          )}
          <span className="flex-1 text-start text-xs">
            {part.filename ?? 'Generated file'}
          </span>
          <ExternalLinkIcon className="size-3 text-muted-foreground group-hover/file-part:text-foreground" />
        </div>
        {isImage && (
          <img
            src={part.url}
            alt={part.filename ?? 'Generated file'}
            className="m-1 w-max rounded object-cover"
          />
        )}
      </Button>
    </div>
  );
};
