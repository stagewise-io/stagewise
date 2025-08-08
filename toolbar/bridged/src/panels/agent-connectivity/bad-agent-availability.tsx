import { useAgentAvailability } from '@/hooks/agent/use-agent-availability';
import { AgentSelection } from '../shared-content/agent-selection.js';
import { AgentAvailabilityError } from '@stagewise/agent-interface/toolbar';

const availabilityErrorMessages = {
  [AgentAvailabilityError.NO_CONNECTION]: `The agent has no connection to it's service.`,
  [AgentAvailabilityError.INCOMPATIBLE_VERSION]: `The agent is running an incompatible version.`,
  [AgentAvailabilityError.NO_AUTHENTICATION]: `You're not authenticated to the agent.`,
  [AgentAvailabilityError.OTHER]: ``,
};

export function BadAgentAvailability() {
  const availabilityStatus = useAgentAvailability();

  if (availabilityStatus.isAvailable) {
    return null;
  }

  return (
    <>
      <span className="text-foreground text-sm">
        The agent is connected to the toolbar, but not ready to use.
        <br />
        <br />
        {'error' in availabilityStatus &&
          availabilityErrorMessages[availabilityStatus.error].length > 0 && (
            <>
              <span className="font-medium text-foreground">Reason</span>
              <br />
              <span className="text-foreground/80">
                {availabilityStatus.errorMessage ||
                  availabilityErrorMessages[availabilityStatus.error]}
              </span>
              <br />
            </>
          )}
      </span>
      <AgentSelection />
    </>
  );
}
