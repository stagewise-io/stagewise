import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/components/ui/panel';
import { MessageCircleQuestionMarkIcon, WifiOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import { useKartonConnected } from '@/hooks/use-karton';

export function AgentConnectivityPanel() {
  const isConnected = useKartonConnected();

  return (
    <Panel
      className={
        '[--color-foreground:var(--color-orange-700)] [--color-muted-foreground:var(--color-orange-700)] before:bg-orange-50/80'
      }
    >
      <PanelHeader
        title="CLI disconnected"
        actionArea={<WifiOffIcon className="size-6" />}
      />
      <PanelContent>
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {!isConnected
              ? 'The connection to the Stagewise CLI has been lost. The toolbar is attempting to reconnect automatically.'
              : 'Establishing connection to the Stagewise CLI...'}
          </p>
          <p className="text-muted-foreground text-sm">Please ensure that:</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
            <li>The CLI application is still running</li>
            <li>The development server hasn't crashed</li>
            <li>Your network connection is stable</li>
          </ul>
          <p className="text-muted-foreground text-sm">
            If the problem persists, try restarting the CLI application.
          </p>
        </div>
      </PanelContent>
      <PanelFooter>
        <Menu>
          <MenuTrigger>
            <Button glassy size="sm" variant="secondary">
              <MessageCircleQuestionMarkIcon className="mr-2 size-4" />
              Need help?
            </Button>
          </MenuTrigger>
          <MenuContent>
            <a href="https://stagewise.io/docs" target="_blank">
              <MenuItem>Read the docs</MenuItem>
            </a>
            <a href="https://discord.gg/gkdGsDYaKA" target="_blank">
              <MenuItem>Ask the community</MenuItem>
            </a>
          </MenuContent>
        </Menu>
      </PanelFooter>
    </Panel>
  );
}
