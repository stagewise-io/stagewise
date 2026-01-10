import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Input } from '../components/input';

const meta = {
  title: 'Example/Input',
  component: Input,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    debounce: { control: 'number' },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
  },
  args: { onValueChange: fn() },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const ExtraSmall: Story = {
  args: {
    placeholder: 'Extra small input',
    size: 'xs',
  },
};

export const Small: Story = {
  args: {
    placeholder: 'Small input',
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    placeholder: 'Medium input',
    size: 'md',
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled input',
    disabled: true,
  },
};

export const WithDebounce: Story = {
  args: {
    placeholder: 'Debounced input (500ms)',
    debounce: 500,
  },
};

export const Required: Story = {
  args: {
    placeholder: 'Required field',
    required: true,
  },
};
