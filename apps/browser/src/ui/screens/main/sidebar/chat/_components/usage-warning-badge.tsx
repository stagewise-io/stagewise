import { useState } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { Button } from '@stagewise/stage-ui/components/button';
import { XIcon, TriangleAlertIcon } from 'lucide-react';

let usageWarningDismissedThisSession = false;

export function UsageWarningBadge() {
  const [openAgent] = useOpenAgent();
  const [dismissed, setDismissed] = useState(
    () => usageWarningDismissedThisSession,
  );

  const usageWarning = useKartonState((s) => {
    if (!openAgent) return undefined;
    return s.agents.instances[openAgent]?.state.usageWarning;
  });

  if (dismissed || !usageWarning) return null;

  const pct = Math.round(usageWarning.usedPercent);
  const window = usageWarning.windowType;

  return (
    <div className="relative flex shrink-0 flex-row items-start gap-2 rounded-md bg-background p-2.5 shadow-elevation-1 ring-1 ring-derived-strong dark:bg-surface-1">
      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
      <span className="text-foreground text-xs">
        You&apos;ve used {pct}% of your {window} limit. Consider switching to a
        cheaper model.
      </span>
      <Button
        variant="ghost"
        size="icon-2xs"
        className="ml-auto shrink-0"
        aria-label="Dismiss usage warning"
        onClick={() => {
          usageWarningDismissedThisSession = true;
          setDismissed(true);
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}
