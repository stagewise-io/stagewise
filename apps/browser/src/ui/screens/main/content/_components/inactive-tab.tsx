import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconXmark } from 'nucleo-micro-bold';
import type { TabState } from '@shared/karton-contracts/ui';

export function InactiveTab({
  faviconUrls,
  title,
  onClick,
  onClose,
  showRightSeparator = true,
}: TabState & {
  onClick: () => void;
  onClose: () => void;
  showRightSeparator?: boolean;
}) {
  return (
    <div
      className={cn(
        `flex w-40 items-center gap-2 self-start rounded-[5px] px-2 py-1 pl-3 transition-colors hover:bg-zinc-50/70`,
        showRightSeparator &&
          'after:-right-[3px] after:absolute after:h-4 after:border-muted-foreground/20 after:border-r after:content-[""]',
      )}
      onClick={onClick}
    >
      {<img src={faviconUrls[0]} alt={title} className="size-4 shrink-0" />}
      <span className="truncate text-foreground text-sm">{title}</span>
      <Button
        variant="ghost"
        size="icon-2xs"
        className="ml-auto shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <IconXmark className="size-3 text-muted-foreground" />
      </Button>
    </div>
  );
}
