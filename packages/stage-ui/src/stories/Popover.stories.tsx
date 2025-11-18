import type { Meta, StoryObj } from '@storybook/react-vite';
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
