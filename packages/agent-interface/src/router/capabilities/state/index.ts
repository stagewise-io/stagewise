import { procedure, router } from '../../trpc';
import { zAsyncIterable } from '../../../utils';
import { type AgentState, agentStateSchema } from './types';

// 2. DEFINE THE IMPLEMENTATION INTERFACE
export interface StateImplementation {
  /** Informs the toolbar about the operational state of the agent.
   *
   * ***You must tell the toolbar about the agent state immediately upon initial execution of the observable!***
   *
   * ***You should not return in this function, as this closes the subscription and will prompt the toolbar to subscribe again.***
   */
  getState: () => AsyncIterable<AgentState>;

  /**
   * Called when the toolbar wants to stop the agent's current processing.
   * This should signal the agent to immediately cease any ongoing operations.
   * Only valid when the agent is in a working state (THINKING, WORKING, CALLING_TOOL).
   *
   * @throws Error if the agent is not in a stoppable state
   */
  onStop: () => Promise<void>;
}

// 3. DEFINE THE SUB-ROUTER
export const stateRouter = (impl: StateImplementation) =>
  router({
    getState: procedure
      .output(
        zAsyncIterable({
          yield: agentStateSchema,
        }),
      )
      .subscription(impl.getState),

    stop: procedure.mutation(() => impl.onStop()),
  });
