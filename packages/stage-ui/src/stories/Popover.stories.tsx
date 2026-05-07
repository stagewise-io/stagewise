import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, useState } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverClose,
  PopoverFooter,
} from '../components/popover';
import { Button } from '../components/button';

const meta = {
  title: 'Example/Popover',
  component: Popover,
  parameters: {},
  tags: ['autodocs'],
  render: () => (
    <Popover>
      <PopoverTrigger>
        <Button variant="secondary">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverClose />
        <PopoverTitle>Popover Title</PopoverTitle>
        <PopoverDescription>
          This is a description that provides more context about the popover
          content.
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  ),
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFooter: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger>
        <Button variant="secondary">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverClose />
        <PopoverTitle>Confirm Action</PopoverTitle>
        <PopoverDescription>
          Are you sure you want to proceed with this action?
        </PopoverDescription>
        <PopoverFooter>
          <Button variant="primary" size="sm">
            Confirm
          </Button>
          <Button variant="secondary" size="sm">
            Cancel
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  ),
};

/**
 * Demonstrates the `anchor` prop on `PopoverContent`. Instead of anchoring to
 * the trigger element, the popover is positioned at an arbitrary viewport
 * coordinate — here, wherever the user right-clicks inside the demo surface.
 * The trigger is a zero-sized `<span>` (the same fallback pattern used by
 * `DeleteConfirmPopover` in the browser app).
 */
export const AnchoredToCursor: Story = {
  render: () => {
    const CursorAnchorDemo = () => {
      const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
      const anchor = useMemo(() => {
        if (!point) return undefined;
        return {
          getBoundingClientRect: () =>
            DOMRect.fromRect({
              x: point.x,
              y: point.y,
              width: 0,
              height: 0,
            }),
        };
      }, [point]);
      return (
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setPoint({ x: e.clientX, y: e.clientY });
          }}
          className="flex h-64 w-full select-none items-center justify-center rounded-md border border-zinc-300 border-dashed text-sm text-zinc-500"
        >
          Right-click anywhere in this box
          <Popover
            open={point !== null}
            onOpenChange={(open) => {
              if (!open) setPoint(null);
            }}
          >
            <PopoverTrigger nativeButton={false}>
              <span className="pointer-events-none absolute size-0" />
            </PopoverTrigger>
            <PopoverContent anchor={anchor} side="top" align="center">
              <PopoverClose />
              <PopoverTitle>Anchored to cursor</PopoverTitle>
              <PopoverDescription>
                This popover is positioned at the viewport coordinate captured
                from the right-click event.
              </PopoverDescription>
              <PopoverFooter>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPoint(null)}
                >
                  Close
                </Button>
              </PopoverFooter>
            </PopoverContent>
          </Popover>
        </div>
      );
    };
    return <CursorAnchorDemo />;
  },
};
