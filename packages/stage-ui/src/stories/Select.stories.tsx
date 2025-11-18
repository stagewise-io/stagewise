import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Select } from '../components/select';
import { CheckIcon, StarIcon, AlertCircleIcon } from 'lucide-react';

const meta = {
  title: 'Example/Select',
  component: Select,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
  },
  args: { onValueChange: fn() },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
  },
};

export const WithIcons: Story = {
  args: {
    items: [
      { value: 'completed', label: 'Completed', icon: <CheckIcon /> },
      { value: 'favorite', label: 'Favorite', icon: <StarIcon /> },
      { value: 'alert', label: 'Alert', icon: <AlertCircleIcon /> },
    ],
    defaultValue: 'completed',
  },
};

export const Disabled: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ],
    defaultValue: 'option1',
    disabled: true,
  },
};
