import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '../components/dialog';
import { Button } from '../components/button';

const meta = {
  title: 'Example/Dialog',
  component: Dialog,
  parameters: {},
  tags: ['autodocs'],
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger>
        <Button variant="primary">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogClose />
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>
            This is a description of what this dialog is about.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1">
          <p className="text-sm">Dialog content goes here.</p>
        </div>
        <DialogFooter>
          <Button variant="primary">Confirm</Button>
          <Button variant="secondary">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
