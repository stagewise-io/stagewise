import { XIcon, FileIcon } from 'lucide-react';
import { useMemo } from 'react';
import { cn, isAnthropicSupportedFile } from '@/utils';
import type { FileAttachment } from '@/hooks/use-chat-state';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { buttonVariants } from '@stagewise/stage-ui/components/button';

interface FileAttachmentChipsProps {
  fileAttachments: FileAttachment[];
  removeFileAttachment: (id: string) => void;
}

export function FileAttachmentChips({
  fileAttachments,
  removeFileAttachment,
}: FileAttachmentChipsProps) {
  if (fileAttachments.length === 0) {
    return null;
  }

  return (
    <>
      {fileAttachments.map((attachment) => (
        <FileAttachmentChip
          key={attachment.id}
          attachment={attachment}
          onDelete={() => removeFileAttachment(attachment.id)}
        />
      ))}
    </>
  );
}

interface FileAttachmentChipProps {
  attachment: FileAttachment;
  onDelete: () => void;
}

function FileAttachmentChip({ attachment, onDelete }: FileAttachmentChipProps) {
  const isImage = useMemo(() => {
    return attachment.file.type.startsWith('image/');
  }, [attachment.file.type]);

  const validation = useMemo(() => {
    return isAnthropicSupportedFile(attachment.file);
  }, [attachment.file]);

  const fileName = useMemo(() => {
    const name = attachment.file.name;
    if (name.length > 20) {
      const lastDot = name.lastIndexOf('.');
      const base = lastDot > 0 ? name.substring(0, lastDot) : name;
      const ext = lastDot > 0 ? name.substring(lastDot) : '';

      if (base.length > 15) {
        return `${base.substring(0, 15)}...${ext}`;
      }
      return `${base}${ext}`;
    }
    return name;
  }, [attachment.file.name]);

  const chipContent = (
    <div
      className={cn(
        buttonVariants({ variant: 'secondary', size: 'xs' }),
        validation.supported
          ? 'hover:border-border/40 hover:bg-white/80'
          : 'opacity-50 hover:opacity-70',
      )}
    >
      {isImage ? (
        <div className="relative size-4 overflow-hidden rounded">
          <img
            src={attachment.url}
            alt={attachment.file.name}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <FileIcon className="size-3 text-foreground/60" />
      )}
      <span className="max-w-24 truncate font-medium text-foreground/80 text-xs">
        {fileName}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-muted-foreground transition-colors hover:text-red-500"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );

  if (!validation.supported) {
    return (
      <Tooltip>
        <TooltipTrigger>{chipContent}</TooltipTrigger>
        <TooltipContent>{validation.reason}</TooltipContent>
      </Tooltip>
    );
  }

  return chipContent;
}
