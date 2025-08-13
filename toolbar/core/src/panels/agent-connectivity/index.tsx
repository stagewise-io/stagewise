import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/components/ui/panel';
import { MessageCircleQuestionMarkIcon, WifiOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuLinkItem,
} from '@/components/ui/dropdown-menu';
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
        <DropdownMenu>
          <DropdownMenuButton>
            <Button glassy size="sm" variant="secondary">
              <MessageCircleQuestionMarkIcon className="mr-2 size-4" />
              Need help?
            </Button>
          </DropdownMenuButton>
          <DropdownMenuContent>
            <DropdownMenuLinkItem
              href="https://stagewise.io/docs"
              target="_blank"
            >
              Read the docs
            </DropdownMenuLinkItem>
            <DropdownMenuLinkItem
              href="https://discord.gg/y8gdNb4D"
              target="_blank"
            >
              Ask the community
            </DropdownMenuLinkItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelFooter>
    </Panel>
  );
}
