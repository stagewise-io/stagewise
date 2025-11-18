import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '../components/collapsible';
import { ChevronDownIcon } from 'lucide-react';

const meta = {
  title: 'Example/Collapsible',
  component: Collapsible,
  parameters: {},
  tags: ['autodocs'],
  render: (args) => (
    <Collapsible {...args}>
      <CollapsibleTrigger size="default">
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        <span>Click to toggle</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border border-border/20 bg-white/40 p-4">
          <p className="text-sm">
            This is the collapsible content. It can contain any elements you
            want to show or hide.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultOpen: false,
  },
};

export const DefaultOpen: Story = {
  args: {
    defaultOpen: true,
  },
};

export const Condensed: Story = {
  render: (args) => (
    <Collapsible {...args}>
      <CollapsibleTrigger size="condensed">
        <ChevronDownIcon className="size-3 transition-transform group-data-[state=open]:rotate-180" />
        <span className="text-xs">Compact version</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border border-border/20 bg-white/40 p-2">
          <p className="text-xs">Condensed collapsible content.</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
