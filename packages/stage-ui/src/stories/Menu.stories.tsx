import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuSubmenuContent,
  type MenuSize,
} from '../components/menu';
import { Button } from '../components/button';
import {
  FileIcon,
  FolderIcon,
  SaveIcon,
  SettingsIcon,
  TrashIcon,
} from 'lucide-react';

const MenuDemo = ({ size }: { size?: MenuSize }) => (
  <Menu>
    <MenuTrigger>
      <Button variant="secondary" size="sm">
        Open Menu
      </Button>
    </MenuTrigger>
    <MenuContent size={size}>
      <MenuItem size={size}>
        <FileIcon className="size-4" />
        New File
      </MenuItem>
      <MenuItem size={size}>
        <FolderIcon className="size-4" />
        New Folder
      </MenuItem>
      <MenuSeparator />
      <MenuItem size={size}>
        <SaveIcon className="size-4" />
        Save
      </MenuItem>
      <MenuSeparator />
      <MenuItem size={size}>
        <TrashIcon className="size-4" />
        Delete
      </MenuItem>
    </MenuContent>
  </Menu>
);

const meta = {
  title: 'Example/Menu',
  component: MenuDemo,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
      description: 'Size of the menu items',
    },
  },
  args: {
    size: 'sm',
  },
} satisfies Meta<typeof MenuDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExtraSmall: Story = {
  args: {
    size: 'xs',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const WithSubmenu: Story = {
  render: (args) => (
    <Menu>
      <MenuTrigger>
        <Button variant="secondary" size="sm">
          Open Menu
        </Button>
      </MenuTrigger>
      <MenuContent size={args.size}>
        <MenuItem size={args.size}>
          <FileIcon className="size-4" />
          New File
        </MenuItem>
        <MenuSubmenu>
          <MenuSubmenuTrigger size={args.size}>
            <FolderIcon className="size-4" />
            More Options
          </MenuSubmenuTrigger>
          <MenuSubmenuContent side="right" size={args.size}>
            <MenuItem size={args.size}>
              <SettingsIcon className="size-4" />
              Settings
            </MenuItem>
            <MenuItem size={args.size}>
              <SaveIcon className="size-4" />
              Save As...
            </MenuItem>
          </MenuSubmenuContent>
        </MenuSubmenu>
        <MenuSeparator />
        <MenuItem size={args.size}>
          <TrashIcon className="size-4" />
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};
