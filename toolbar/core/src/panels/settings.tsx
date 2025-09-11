import {
  Panel,
  PanelContent,
  PanelFooter,
  PanelHeader,
} from '@/components/ui/panel';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from '@stagewise/stage-ui/components/menu';
import { MessageCircleQuestionMarkIcon } from 'lucide-react';
import { Button } from '@stagewise/stage-ui/components/button';

// FYI: We don't show this panel at all in agent hosted mode right now
export function SettingsPanel() {
  return (
    <Panel>
      <PanelHeader title="Settings" />
      <PanelContent>Nothing to see :o</PanelContent>
      <PanelFooter>
        <Menu>
          <MenuTrigger>
            <Button size="icon-sm" variant="secondary">
              <MessageCircleQuestionMarkIcon className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <a href="https://stagewise.io/docs" target="_blank">
              <MenuItem>Read the docs</MenuItem>
            </a>
            <a href="https://discord.gg/gkdGsDYaKA" target="_blank">
              <MenuItem>Join the community</MenuItem>
            </a>
          </MenuContent>
        </Menu>
      </PanelFooter>
    </Panel>
  );
}
