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
 * Confirmation popover for permanently deleting an agent.
 * Controlled by the parent via `open` / `onOpenChange`.
 */
export function DeleteConfirmPopover({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger nativeButton={false}>
        <span className="pointer-events-none absolute right-0 bottom-0 size-0" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Delete agent?</PopoverTitle>
        <PopoverDescription>
          This will permanently delete this agent and its chat history.
        </PopoverDescription>
        <PopoverClose />
        <PopoverFooter>
          <Button variant="primary" size="xs" onClick={onConfirm} autoFocus>
            Delete
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
}
