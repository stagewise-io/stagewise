import { cn } from '@/utils';
import { getFileIcon } from '@/utils/file-icons';
import { XIcon } from 'lucide-react';

interface FileMentionChipProps {
  filename: string;
  filepath: string;
  onRemove?: () => void;
  className?: string;
}

export function FileMentionChip({
  filename,
  filepath,
  onRemove,
  className,
}: FileMentionChipProps) {
  const { Icon, color } = getFileIcon(filename);

  return (
    <div
      className={cn(
        'flex min-w-fit shrink-0 items-center gap-1 rounded-lg border border-border/20 bg-white/30 px-2 py-1 shadow-sm backdrop-blur-lg transition-all hover:border-border/40 hover:bg-white/80',
        className,
      )}
      title={filepath}
    >
      <Icon
        className="size-3 text-foreground/60"
        style={{ color: color || undefined }}
      />
      <span className="max-w-24 truncate font-medium text-foreground/80 text-xs">
        {filename}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-muted-foreground transition-colors hover:text-red-500"
          aria-label="Remove file mention"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
}
