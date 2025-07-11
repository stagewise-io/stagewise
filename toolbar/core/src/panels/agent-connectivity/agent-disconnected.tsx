import { AgentSelection } from '../shared-content/agent-selection';

export function AgentDisconnected() {
  return (
    <>
      <span className="text-foreground text-sm">
        The previously connected agent is not available anymore.
        <br />
        <br />
        Try to wait a second or restart the agent.
      </span>
      <AgentSelection />
    </>
  );
}
5;
