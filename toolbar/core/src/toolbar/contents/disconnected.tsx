import { Loader2Icon } from 'lucide-react';
import { ToolbarItem } from '../components/item';
import { ToolbarSection } from '../components/section';

export function DisconnectedContent() {
  // For app-hosted agents, show a loading spinner instead of refresh button
  return (
    <ToolbarSection>
      <ToolbarItem>
        <Loader2Icon className="size-4 animate-spin" />
      </ToolbarItem>
    </ToolbarSection>
  );
}
