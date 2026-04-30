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
import { useRef } from 'react';
import { useFloatingIsolation } from './use-floating-isolation';

/**
 * Confirmation popover for permanently deleting an agent.
 * Controlled by the parent via `open` / `onOpenChange`.
 *
 * Pass `isolated` when this popover may appear alongside (not inside) an
 * ambient floating surface such as an open Combobox — the right-click
 * context-menu flow is the main case. Isolation stops clicks inside this
 * popover from dismissing the ambient surface. See `useFloatingIsolation`.
 */
export function DeleteConfirmPopover({
  open,
  onOpenChange,
  onConfirm,
  isolated = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isolated?: boolean;
}) {
  // PopoverContent doesn't forwardRef — mount an internal `display: contents`
  // wrapper we can ref and use as the isolation boundary.
  const shieldRef = useRef<HTMLDivElement>(null);
  useFloatingIsolation(shieldRef, isolated && open);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger nativeButton={false}>
        <span className="pointer-events-none absolute right-0 bottom-0 size-0" />
      </PopoverTrigger>
      <PopoverContent>
        <div ref={shieldRef} className="contents">
          <PopoverTitle>Delete agent?</PopoverTitle>
          <PopoverDescription>
            This will permanently delete this agent and its chat history.
          </PopoverDescription>
          <PopoverClose />
          <PopoverFooter>
            <Button variant="primary" size="xs" onClick={onConfirm} autoFocus>
              Delete
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </PopoverFooter>
        </div>
      </PopoverContent>
    </Popover>
  );
}
