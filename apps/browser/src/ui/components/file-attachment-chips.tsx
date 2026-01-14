import { XIcon, FileIcon } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import {
  PreviewCard,
  PreviewCardContent,
  PreviewCardTrigger,
} from '@stagewise/stage-ui/components/preview-card';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

/**
 * Unified interface for file attachment data that works for both edit mode and view mode.
 * Can be constructed from:
 * - FileAttachment (edit mode): { id, url, filename: file.name, mediaType: file.type }
 * - FileUIPart (view mode): { id: index-based, url, filename, mediaType }
 */
export interface FileAttachmentData {
  id: string;
  url: string;
  filename: string;
  mediaType: string;
  /** Optional validation info - if not provided, file is assumed to be valid */
  validation?: {
    supported: boolean;
    reason?: string;
  };
}

interface FileAttachmentChipsProps {
  fileAttachments: FileAttachmentData[];
  /** Optional - when provided, shows delete button on each chip */
  removeFileAttachment?: (id: string) => void;
  /** Optional className applied to each chip */
  className?: string;
}

export function FileAttachmentChips({
  fileAttachments,
  removeFileAttachment,
  className,
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
          onDelete={
            removeFileAttachment
              ? () => removeFileAttachment(attachment.id)
              : undefined
          }
          className={className}
        />
      ))}
    </>
  );
}

interface FileAttachmentChipProps {
  attachment: FileAttachmentData;
  /** Optional - when provided, shows delete button */
  onDelete?: () => void;
  /** Optional className applied to the chip */
  className?: string;
}

function FileAttachmentChip({
  attachment,
  onDelete,
  className,
}: FileAttachmentChipProps) {
  const isImage = useMemo(() => {
    return attachment.mediaType.startsWith('image/');
  }, [attachment.mediaType]);

  const isValid = attachment.validation?.supported !== false;
  const validationReason = attachment.validation?.reason;

  const fileName = useMemo(() => {
    const name = attachment.filename;
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
  }, [attachment.filename]);

  const chipContent = (
    <Button
      size="xs"
      variant="secondary"
      className={cn(
        'cursor-default!',
        !isValid && 'opacity-50 hover:opacity-70',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {isImage ? (
        <div className="relative size-4 overflow-hidden rounded">
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <FileIcon className="size-3" />
      )}
      <span className="max-w-24 truncate font-medium text-xs">{fileName}</span>
      {onDelete && (
        <div
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
            '-mr-2 transition-colors hover:text-error',
          )}
        >
          <XIcon className="size-3" />
        </div>
      )}
    </Button>
  );

  if (!isValid && validationReason) {
    return (
      <Tooltip>
        <TooltipTrigger>{chipContent}</TooltipTrigger>
        <TooltipContent>{validationReason}</TooltipContent>
      </Tooltip>
    );
  }

  // For images, show preview on hover
  if (isImage) {
    return (
      <PreviewCard>
        <PreviewCardTrigger delay={200} closeDelay={100}>
          {chipContent}
        </PreviewCardTrigger>
        <PreviewCardContent className="flex w-64 flex-col items-stretch gap-2">
          <div className="flex min-h-24 w-full items-center justify-center overflow-hidden rounded-sm bg-background ring-1 ring-border-subtle">
            <img
              src={attachment.url}
              className="max-h-36 max-w-full object-contain"
              alt={attachment.filename}
            />
          </div>
          <span className="font-medium text-foreground text-xs">
            {attachment.filename}
          </span>
        </PreviewCardContent>
      </PreviewCard>
    );
  }

  return chipContent;
}
