import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Radio, RadioGroup, RadioLabel } from '../components/radio';

const meta = {
  title: 'Example/Radio',
  component: RadioGroup,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
  },
  args: { onValueChange: fn() },
  render: (args) => (
    <RadioGroup {...args}>
      <RadioLabel>
        <Radio value="option1" />
        Option 1
      </RadioLabel>
      <RadioLabel>
        <Radio value="option2" />
        Option 2
      </RadioLabel>
      <RadioLabel>
        <Radio value="option3" />
        Option 3
      </RadioLabel>
    </RadioGroup>
  ),
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: 'option1',
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: 'option1',
    disabled: true,
  },
};

export const NoDefault: Story = {
  args: {},
};
