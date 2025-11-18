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
} from '../components/menu';
import { Button } from '../components/button';
import {
  FileIcon,
  FolderIcon,
  SaveIcon,
  SettingsIcon,
  TrashIcon,
} from 'lucide-react';

const meta = {
  title: 'Example/Menu',
  component: Menu,
  parameters: {},
  tags: ['autodocs'],
  render: () => (
    <Menu>
      <MenuTrigger>
        <Button variant="secondary">Open Menu</Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem>
          <FileIcon className="size-4" />
          New File
        </MenuItem>
        <MenuItem>
          <FolderIcon className="size-4" />
          New Folder
        </MenuItem>
        <MenuSeparator />
        <MenuItem>
          <SaveIcon className="size-4" />
          Save
        </MenuItem>
        <MenuSeparator />
        <MenuItem>
          <TrashIcon className="size-4" />
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSubmenu: Story = {
  render: () => (
    <Menu>
      <MenuTrigger>
        <Button variant="secondary">Open Menu</Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem>
          <FileIcon className="size-4" />
          New File
        </MenuItem>
        <MenuSubmenu>
          <MenuSubmenuTrigger>
            <FolderIcon className="size-4" />
            More Options
          </MenuSubmenuTrigger>
          <MenuSubmenuContent side="right">
            <MenuItem>
              <SettingsIcon className="size-4" />
              Settings
            </MenuItem>
            <MenuItem>
              <SaveIcon className="size-4" />
              Save As...
            </MenuItem>
          </MenuSubmenuContent>
        </MenuSubmenu>
        <MenuSeparator />
        <MenuItem>
          <TrashIcon className="size-4" />
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};
