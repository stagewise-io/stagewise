import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  PreviewCard,
  PreviewCardTrigger,
  PreviewCardContent,
} from '../components/preview-card';
import { Button } from '../components/button';

const meta = {
  title: 'Example/PreviewCard',
  component: PreviewCard,
  parameters: {},
  tags: ['autodocs'],
  render: () => (
    <PreviewCard>
      <PreviewCardTrigger>
        <Button variant="secondary">Hover for Preview</Button>
      </PreviewCardTrigger>
      <PreviewCardContent>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">Preview Card</h3>
          <p className="text-muted-foreground text-xs">
            This is a preview card that appears on hover. It can contain any
            content you need.
          </p>
        </div>
      </PreviewCardContent>
    </PreviewCard>
  ),
} satisfies Meta<typeof PreviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithImage: Story = {
  render: () => (
    <PreviewCard>
      <PreviewCardTrigger>
        <Button variant="secondary">Preview with Image</Button>
      </PreviewCardTrigger>
      <PreviewCardContent>
        <div className="flex flex-col gap-3">
          <div className="h-32 w-full rounded-lg bg-muted" />
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-sm">Image Preview</h3>
            <p className="text-muted-foreground text-xs">
              Preview cards can include images and rich content.
            </p>
          </div>
        </div>
      </PreviewCardContent>
    </PreviewCard>
  ),
};

export const PositionedLeft: Story = {
  render: () => (
    <div className="flex justify-end">
      <PreviewCard>
        <PreviewCardTrigger>
          <Button variant="secondary">Preview on Left</Button>
        </PreviewCardTrigger>
        <PreviewCardContent side="left">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-sm">Left Side Preview</h3>
            <p className="text-muted-foreground text-xs">
              This preview card appears on the left side of the trigger.
            </p>
          </div>
        </PreviewCardContent>
      </PreviewCard>
    </div>
  ),
};

export const PositionedTop: Story = {
  render: () => (
    <div className="pt-40">
      <PreviewCard>
        <PreviewCardTrigger>
          <Button variant="secondary">Preview on Top</Button>
        </PreviewCardTrigger>
        <PreviewCardContent side="top">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-sm">Top Side Preview</h3>
            <p className="text-muted-foreground text-xs">
              This preview card appears above the trigger.
            </p>
          </div>
        </PreviewCardContent>
      </PreviewCard>
    </div>
  ),
};
