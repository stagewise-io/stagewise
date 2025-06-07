import { RefreshCwIcon } from 'lucide-react';
import { ToolbarSection } from '../section';
import { ToolbarButton } from '../button';
import { cn } from '@/utils';
import { useVSCode } from '@/hooks/use-vscode';

export function DisconnectedStateButtons() {
  const { discover, isDiscovering } = useVSCode();

  return (
    <ToolbarSection>
      <ToolbarButton
        onClick={!isDiscovering ? () => discover() : undefined}
        className={cn(
          !isDiscovering
            ? 'text-orange-700 hover:bg-orange-200'
            : 'text-blue-700',
        )}
      >
        <RefreshCwIcon
          className={cn('size-4', isDiscovering && 'animate-spin')}
        />
      </ToolbarButton>
    </ToolbarSection>
  );
}
