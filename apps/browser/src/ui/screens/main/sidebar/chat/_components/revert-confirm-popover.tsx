import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverFooter,
  PopoverClose,
} from '@stagewise/stage-ui/components/popover';
import { Button } from '@stagewise/stage-ui/components/button';

/**
 * Shared confirmation popover for file revert actions.
 * Used by both `MessageUser` (edit revert) and `MessageAssistant`
 * (restore checkpoint revert).
 */
export function RevertConfirmPopover({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (undoToolCalls: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger nativeButton={false}>
        <span className="pointer-events-none absolute right-0 bottom-0 size-0" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Keep or revert files?</PopoverTitle>
        <PopoverDescription>
          Do you want to revert file changes made after this message?
        </PopoverDescription>
        <PopoverClose />
        <PopoverFooter>
          <Button
            variant="primary"
            size="xs"
            onClick={() => onConfirm(true)}
            autoFocus
          >
            Revert files
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onConfirm(false)}>
            Keep
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
}
