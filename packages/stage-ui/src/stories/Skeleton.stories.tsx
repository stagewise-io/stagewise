import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from '../components/skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['rectangle', 'circle', 'text'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', 'full'],
    },
    animate: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'rectangle',
    size: 'md',
    animate: true,
    className: 'w-64',
  },
};

export const Circle: Story = {
  args: {
    variant: 'circle',
    size: 'md',
    animate: true,
    className: 'w-16',
  },
};

export const Text: Story = {
  args: {
    variant: 'text',
    size: 'sm',
    animate: true,
    className: 'w-48',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-4">
      <Skeleton size="xs" />
      <Skeleton size="sm" />
      <Skeleton size="md" />
      <Skeleton size="lg" />
      <Skeleton size="xl" />
    </div>
  ),
};

export const LoadingCard: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4 rounded-xl border border-zinc-200 p-6">
      <div className="flex items-center gap-4">
        <Skeleton variant="circle" size="xl" className="w-16" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton variant="text" size="sm" className="w-32" />
          <Skeleton variant="text" size="xs" className="w-24" />
        </div>
      </div>
      <Skeleton variant="rectangle" size="lg" className="w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" size="sm" />
        <Skeleton variant="text" size="sm" />
        <Skeleton variant="text" size="sm" className="w-3/4" />
      </div>
    </div>
  ),
};

export const WithoutAnimation: Story = {
  args: {
    variant: 'rectangle',
    size: 'md',
    animate: false,
    className: 'w-64',
  },
};
