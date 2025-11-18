import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/tabs';
import { HomeIcon, SettingsIcon, UserIcon } from 'lucide-react';

const meta = {
  title: 'Example/Tabs',
  component: Tabs,
  parameters: {},
  tags: ['autodocs'],
  args: { onValueChange: fn() },
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger
          value="home"
          icon={<HomeIcon className="size-5" />}
          title="Home"
        />
        <TabsTrigger
          value="profile"
          icon={<UserIcon className="size-5" />}
          title="Profile"
        />
        <TabsTrigger
          value="settings"
          icon={<SettingsIcon className="size-5" />}
          title="Settings"
        />
      </TabsList>
      <TabsContent value="home">
        <div className="rounded-lg border border-border/20 bg-white/40 p-4">
          <h2 className="mb-2 font-semibold text-lg">Home</h2>
          <p className="text-sm">Welcome to the home tab!</p>
        </div>
      </TabsContent>
      <TabsContent value="profile">
        <div className="rounded-lg border border-border/20 bg-white/40 p-4">
          <h2 className="mb-2 font-semibold text-lg">Profile</h2>
          <p className="text-sm">Your profile information goes here.</p>
        </div>
      </TabsContent>
      <TabsContent value="settings">
        <div className="rounded-lg border border-border/20 bg-white/40 p-4">
          <h2 className="mb-2 font-semibold text-lg">Settings</h2>
          <p className="text-sm">Adjust your settings here.</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: 'home',
  },
};
