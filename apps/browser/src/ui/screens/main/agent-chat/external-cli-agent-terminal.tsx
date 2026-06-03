import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { PerTerminalContent } from '../terminal-panel/_components/per-terminal-content';

export function ExternalCliAgentTerminal({
  agentId,
}: {
  agentId: string | null;
}) {
  const externalCli = useKartonState((s) =>
    agentId ? (s.agents.instances[agentId]?.externalCli ?? null) : null,
  );
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);

  if (!agentId || !externalCli) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground text-sm">
        External agent is not available.
      </div>
    );
  }

  if (externalCli.terminalId) {
    return (
      <div className="size-full overflow-hidden rounded-md bg-background pt-8">
        <PerTerminalContent terminalId={externalCli.terminalId} isActive />
      </div>
    );
  }

  const title = externalCli.kind === 'claude' ? 'Claude' : 'Codex';
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 pt-8 text-center">
      <div>
        <div className="font-medium text-foreground text-sm">
          {title} terminal{' '}
          {externalCli.status === 'exited' ? 'exited' : 'unavailable'}
        </div>
        <div className="mt-1 max-w-sm text-muted-foreground text-xs">
          {externalCli.unavailableReason ??
            `Workspace: ${externalCli.workspacePath}`}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void resumeAgent(agentId)}
      >
        Restart {title}
      </Button>
    </div>
  );
}
