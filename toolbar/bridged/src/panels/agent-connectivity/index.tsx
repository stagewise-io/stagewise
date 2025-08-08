import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/components/ui/panel';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { useMemo } from 'react';
import { cn } from '@/utils';
import { SelectAgent } from './select-agent.js';
import { NoAgentFound } from './no-agent-found.js';
import { AgentDisconnected } from './agent-disconnected.js';
import {
  TriangleAlertIcon,
  MessageCircleQuestionMarkIcon,
  WifiOffIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuLinkItem,
} from '@/components/ui/dropdown-menu';
import { useAgentAvailability } from '@/hooks/agent/use-agent-availability';
import { BadAgentAvailability } from './bad-agent-availability.js';
import { AgentAvailabilityError } from '@stagewise/agent-interface/toolbar';

export function AgentConnectivityPanel() {
  const { availableAgents, connectedUnavailable, connected } = useAgents();

  const availabilityStatus = useAgentAvailability();

  const shouldRenderAsWarning = useMemo(() => {
    return (
      availableAgents.length === 0 ||
      connectedUnavailable ||
      !availabilityStatus.isAvailable
    );
  }, [availableAgents, connectedUnavailable, availabilityStatus, connected]);

  const title = useMemo(() => {
    if (availableAgents.length === 0) {
      return 'No agents available';
    }

    if (connectedUnavailable) {
      return 'Agent disconnected';
    }

    if (connected && !availabilityStatus.isAvailable) {
      return 'Agent not ready to use';
    }

    return 'Select an agent to connect to';
  }, [availableAgents, connectedUnavailable, availabilityStatus, connected]);

  const renderedIcon = useMemo(() => {
    if (!shouldRenderAsWarning) {
      return null;
    }

    if (
      connectedUnavailable ||
      (connected &&
        'error' in availabilityStatus &&
        availabilityStatus.error === AgentAvailabilityError.NO_CONNECTION)
    ) {
      return <WifiOffIcon className="size-6" />;
    }

    return <TriangleAlertIcon className="size-6" />;
  }, [connectedUnavailable, connected, availabilityStatus]);

  return (
    <Panel
      className={cn(
        shouldRenderAsWarning &&
          '[--color-foreground:var(--color-orange-700)] [--color-muted-foreground:var(--color-orange-600)] before:bg-orange-50/80',
      )}
    >
      <PanelHeader
        title={title}
        actionArea={shouldRenderAsWarning && renderedIcon}
      />
      <PanelContent>
        {availableAgents.length > 0 && !connectedUnavailable && !connected && (
          <SelectAgent />
        )}
        {connectedUnavailable && <AgentDisconnected />}
        {availableAgents.length === 0 && !connectedUnavailable && (
          <NoAgentFound />
        )}
        {!connectedUnavailable &&
          connected &&
          !availabilityStatus.isAvailable && <BadAgentAvailability />}
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
              Join the community
            </DropdownMenuLinkItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelFooter>
    </Panel>
  );
}
