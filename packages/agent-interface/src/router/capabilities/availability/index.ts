import { procedure, router } from '../../trpc';
import { zAsyncIterable } from '../../../utils';
import { type AgentAvailability, agentAvailabilitySchema } from './types';

// 2. DEFINE THE IMPLEMENTATION INTERFACE
export interface AvailabilityImplementation {
  /** Informs the toolbar about the availability of the agent.
   *
   * ***You must tell the toolbar about the agent availability immediately upon initial execution of the observable!***
   *
   * ***You should not return in this function, as this closes the subscription and will prompt the toolbar to subscribe again.***
   */
  getAvailability: () => AsyncIterable<AgentAvailability>;
}

// 3. DEFINE THE SUB-ROUTER
export const availabilityRouter = (impl: AvailabilityImplementation) =>
  router({
    getAvailability: procedure
      .output(
        zAsyncIterable({
          yield: agentAvailabilitySchema,
        }),
      )
      .subscription(impl.getAvailability),
  });
