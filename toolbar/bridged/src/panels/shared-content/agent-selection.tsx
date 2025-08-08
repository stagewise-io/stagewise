import { useAgents } from '@/hooks/agent/use-agent-provider';
import { RefreshCwIcon } from 'lucide-react';

export function AgentSelection({
  showConnectedDetails = false,
}: {
  showConnectedDetails?: boolean;
}) {
  const { connected, isRefreshing, availableAgents, connectAgent } =
    useAgents();

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const port = Number.parseInt(e.target.value);
    if (port) {
      connectAgent(port);
    }
  };

  // Use stable placeholder text that doesn't change during refresh to prevent layout shifts
  const placeholderText =
    availableAgents.length > 0 ? 'Select an agent...' : 'No agents available';

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="agent-select"
          className="mb-2 block font-medium text-foreground text-sm"
        >
          Agent
          {isRefreshing && (
            <RefreshCwIcon className="ml-2 inline size-3 animate-spin text-muted-foreground" />
          )}
        </label>
        <div className="flex w-full items-center space-x-2">
          <select
            id="agent-select"
            value={connected?.port || ''}
            onChange={handleAgentChange}
            className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-950/10 bg-zinc-500/10 px-3 text-sm ring-1 ring-white/20 focus:border-zinc-500 focus:outline-none"
          >
            <option value="" disabled>
              {placeholderText}
            </option>
            {availableAgents.map((agent) => (
              <option key={agent.port} value={agent.port}>
                {agent.name} - {agent.description} - Port {agent.port}
              </option>
            ))}
          </select>
        </div>
      </div>

      {connected && showConnectedDetails && (
        <div className="rounded-lg bg-zinc-950/5 p-3">
          <p className="font-medium text-foreground text-sm">Active Agent</p>

          <p className="mt-2 font-semibold text-base text-foreground">
            {connected.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {connected.description}
          </p>
          <p className="text-muted-foreground text-xs">Port {connected.port}</p>
        </div>
      )}
    </div>
  );
}
