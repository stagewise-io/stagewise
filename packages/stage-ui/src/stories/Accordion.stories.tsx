import type { Meta, StoryObj } from '@storybook/react-vite';

import { fn } from 'storybook/test';

import { Accordion, AccordionItem } from '../components/accordion.js';
import { CogIcon } from 'lucide-react';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'Example/Accordion',
  component: () => (
    <Accordion>
      <AccordionItem title="item1" icon={<CogIcon className="size-5" />}>
        This is content for Item 1.
      </AccordionItem>
      <AccordionItem title="item2">This is content for Item 2.</AccordionItem>
      <AccordionItem title="item3">This is content for Item 3.</AccordionItem>
    </Accordion>
  ),
  parameters: {},
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    disabled: { control: 'boolean' },
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
  args: { onClick: fn() },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Enabled: Story = {
  args: {
    defaultChecked: true,
  },
};
