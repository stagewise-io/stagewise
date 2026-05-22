import {
  PreviewCard,
  PreviewCardContent,
  PreviewCardTrigger,
} from '@stagewise/stage-ui/components/preview-card';
import type { TabState } from '@shared/karton-contracts/ui';
import type { ReactElement } from 'react';
import {
  IconFolderOpenOutline18,
  IconSquareTerminalOutline18,
} from 'nucleo-ui-outline-18';

function TerminalMetadataBlock({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-row items-start gap-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground text-xs">{label}</div>
        <div className="break-all text-muted-foreground text-xs">{value}</div>
      </div>
    </div>
  );
}

export function WithTerminalTabPreviewCard({
  tabState,
  children,
  activeTabId,
}: {
  tabState: TabState;
  children: ReactElement;
  activeTabId: string | null | undefined;
}) {
  const isActive = tabState.id === activeTabId;

  // Match browser preview behavior: the active tab is already visible.
  if (isActive) return children;

  return (
    <PreviewCard>
      <PreviewCardTrigger delay={600} closeDelay={10} tabIndex={-1}>
        {children}
      </PreviewCardTrigger>
      <PreviewCardContent
        className="flex w-72 flex-col items-stretch gap-3"
        sideOffset={2}
      >
        <TerminalMetadataBlock
          icon={
            <IconSquareTerminalOutline18 className="mt-0.5 size-4 shrink-0 text-subtle-foreground" />
          }
          label="Running process"
          value={tabState.terminalRunningProcess ?? 'Shell idle'}
        />
        <TerminalMetadataBlock
          icon={
            <IconFolderOpenOutline18 className="mt-0.5 size-4 shrink-0 text-subtle-foreground" />
          }
          label="Working directory"
          value={tabState.cwd || 'Unknown'}
        />
      </PreviewCardContent>
    </PreviewCard>
  );
}
