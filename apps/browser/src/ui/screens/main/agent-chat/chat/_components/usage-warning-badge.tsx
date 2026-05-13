import { useState, useMemo } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { Button } from '@stagewise/stage-ui/components/button';
import { XIcon, TriangleAlertIcon } from 'lucide-react';

const THRESHOLDS = [80, 90, 100] as const;

/** Highest threshold dismissed this app session. Resets on restart. */
let lastDismissedThreshold = 0;

/** Find the highest crossed threshold that hasn't been dismissed yet. */
function findActiveThreshold(
  usedPercent: number,
  dismissed: number,
): number | null {
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    const t = THRESHOLDS[i]!;
    if (usedPercent >= t && t > dismissed) return t;
  }
  return null;
}

export function UsageWarningBadge() {
  const [dismissedThreshold, setDismissedThreshold] = useState(
    () => lastDismissedThreshold,
  );

  // Scan all agents — not just the open one — so the warning is global.
  const instances = useKartonState((s) => s.agents.instances);
  const stateUsageWarning = useMemo(() => {
    let highest:
      | NonNullable<(typeof instances)[string]['state']['usageWarning']>
      | undefined;
    for (const instance of Object.values(instances)) {
      const warning = instance.state.usageWarning;
      if (warning && (!highest || warning.usedPercent > highest.usedPercent)) {
        highest = warning;
      }
    }
    return highest;
  }, [instances]);

  if (!stateUsageWarning) return null;

  const activeThreshold = findActiveThreshold(
    stateUsageWarning.usedPercent,
    dismissedThreshold,
  );

  if (!activeThreshold) return null;

  const pct = Math.round(stateUsageWarning.usedPercent);
  const window = stateUsageWarning.windowType;

  return (
    <div className="relative flex shrink-0 flex-row items-start gap-2 rounded-md bg-background/60 p-2.5 shadow-elevation-1 ring-1 ring-derived-strong backdrop-blur-xl dark:bg-surface-1/60">
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
          lastDismissedThreshold = activeThreshold;
          setDismissedThreshold(activeThreshold);
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}
