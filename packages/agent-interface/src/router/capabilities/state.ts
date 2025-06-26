import { z } from 'zod';
import { procedure, router } from '../trpc';
import { zAsyncIterable } from '../../utils';

// 1. DEFINE ALL TYPES AND SCHEMAS

export enum AgentStateType {
  IDLE = 'idle',
  THINKING = 'thinking',
  WORKING = 'working',
  CALLING_TOOL = 'calling_tool',
  WAITING_FOR_USER_RESPONSE = 'waiting_for_user_response',
  FAILED = 'failed',
  COMPLETED = 'completed', // You should stay in this state for at least a second. The toolbar may show this state for a longer duration.
}

const agentStateSchema = z.object({
  state: z.nativeEnum(AgentStateType),
  description: z.string().min(3).max(128).optional(),
});

export type AgentState = z.infer<typeof agentStateSchema>;

// 2. DEFINE THE IMPLEMENTATION INTERFACE
export interface StateImplementation {
  /** Informs the toolbar about the operational state of the agent.
   *
   * ***You must tell the toolbar about the agent state immediately upon initial execution of the observable!***
   *
   * ***You should not return in this function, as this closes the subscription and will prompt the toolbar to subscribe again.***
   */
  getState: () => AsyncIterable<AgentState>;
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
  });
