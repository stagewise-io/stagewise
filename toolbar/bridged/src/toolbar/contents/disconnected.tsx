import { cn } from '@/utils';
import { RefreshCwIcon } from 'lucide-react';
import { ToolbarButton } from '../components/button.js';
import { ToolbarSection } from '../components/section.js';
import { useAgents } from '@/hooks/agent/use-agent-provider';

export function DisconnectedContent() {
  const { refreshAgentList, isRefreshing } = useAgents();

  return (
    <ToolbarSection>
      <ToolbarButton
        onClick={!isRefreshing ? () => refreshAgentList() : undefined}
      >
        <RefreshCwIcon
          className={cn('size-4', isRefreshing && 'animate-spin')}
        />
      </ToolbarButton>
    </ToolbarSection>
  );
}
