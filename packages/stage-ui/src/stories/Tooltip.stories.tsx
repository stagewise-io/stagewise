import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/tooltip';
import { Button } from '../components/button';
import { InfoIcon } from 'lucide-react';

const meta = {
  title: 'Example/Tooltip',
  component: Tooltip,
  parameters: {},
  tags: ['autodocs'],
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant="secondary" size="icon-md">
          <InfoIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>This is a helpful tooltip</TooltipContent>
    </Tooltip>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnText: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <span className="cursor-help underline decoration-dotted">
          Hover over me
        </span>
      </TooltipTrigger>
      <TooltipContent>Additional information appears here</TooltipContent>
    </Tooltip>
  ),
};
