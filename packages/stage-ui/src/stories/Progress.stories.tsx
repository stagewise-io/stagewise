import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Progress,
  ProgressTrack,
  ProgressLabel,
  ProgressValue,
} from '../components/progress';

const meta = {
  title: 'Example/Progress',
  component: Progress,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
  },
  render: (args) => (
    <Progress {...args}>
      <ProgressLabel>Loading...</ProgressLabel>
      <ProgressValue>{(formatted) => formatted}</ProgressValue>
      <ProgressTrack variant="normal" />
    </Progress>
  ),
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 50,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
  },
};

export const Warning: Story = {
  args: {
    value: 75,
  },
  render: (args) => (
    <Progress {...args}>
      <ProgressLabel>Warning state</ProgressLabel>
      <ProgressValue>{(formatted) => formatted}</ProgressValue>
      <ProgressTrack variant="warning" />
    </Progress>
  ),
};

export const Busy: Story = {
  args: {
    value: 45,
  },
  render: (args) => (
    <Progress {...args}>
      <ProgressLabel>Processing...</ProgressLabel>
      <ProgressValue>{(formatted) => formatted}</ProgressValue>
      <ProgressTrack busy />
    </Progress>
  ),
};

export const Slim: Story = {
  args: {
    value: 60,
  },
  render: (args) => (
    <Progress {...args}>
      <ProgressLabel>Slim variant</ProgressLabel>
      <ProgressValue>{(formatted) => formatted}</ProgressValue>
      <ProgressTrack slim />
    </Progress>
  ),
};

export const Indeterminate: Story = {
  args: {
    value: null,
  },
  render: (args) => (
    <Progress {...args}>
      <ProgressLabel>Loading...</ProgressLabel>
      <ProgressTrack busy />
    </Progress>
  ),
};
