import { Button } from '@stagewise/stage-ui/components/button';
import { IconXmark } from 'nucleo-micro-bold';
import type { SuggestionItem } from './suggestions-data';
import { cn } from '@ui/utils';

export type ChatSuggestionProps = SuggestionItem & {
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
};

export const ChatSuggestion: React.FC<ChatSuggestionProps> = ({
  suggestion,
  origin,
  onClick,
  onRemove,
  className,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group/suggestion relative flex w-full cursor-pointer flex-row items-center justify-start gap-3 rounded-lg px-2.5 py-2 text-muted-foreground hover:bg-hover-derived hover:text-foreground',
        className,
      )}
    >
      <span className="flex shrink-0 items-center">
        <img
          src={origin.faviconUrl}
          className="size-3 rounded-sm"
          alt="Favicon"
        />
      </span>
      <span className="group-hover/suggestion:mask-[linear-gradient(to_left,transparent_0px,transparent_24px,black_48px)] w-full overflow-hidden text-sm leading-tight transition-[mask-image] duration-200">
        {suggestion}
      </span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 ml-auto hidden -translate-y-1/2 text-muted-foreground group-hover/suggestion:flex"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <IconXmark className="size-3" />
        </Button>
      )}
    </div>
  );
};
