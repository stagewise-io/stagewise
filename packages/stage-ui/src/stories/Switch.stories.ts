import type { Meta, StoryObj } from '@storybook/react-vite';

import { fn } from 'storybook/test';

import { Switch } from '../components/switch';

const meta = {
  title: 'Example/Switch',
  component: Switch,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
  },
  args: { onCheckedChange: fn() },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultChecked: true,
  },
};

export const ExtraSmall: Story = {
  args: {
    defaultChecked: true,
    size: 'xs',
  },
};

export const Small: Story = {
  args: {
    defaultChecked: true,
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    defaultChecked: true,
    size: 'md',
  },
};

export const Disabled: Story = {
  args: {
    defaultChecked: false,
    disabled: true,
  },
};
