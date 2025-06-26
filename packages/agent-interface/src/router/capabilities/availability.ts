import { z } from 'zod';
import { procedure, router } from '../trpc';
import { zAsyncIterable } from '../../utils';

// 1. DEFINE ALL TYPES AND SCHEMAS

export enum AgentAvailabilityError {
  NO_CONNECTION = 'no_connection',
  NO_AUTHENTICATION = 'no_authentication',
  INCOMPATIBLE_VERSION = 'incompatible_version',
  OTHER = 'other',
}

const agentAvailabilitySchema = z.discriminatedUnion('isAvailable', [
  z.object({
    isAvailable: z.literal(true),
  }),
  z.object({
    isAvailable: z.literal(false),
    error: z.nativeEnum(AgentAvailabilityError),
    errorMessage: z.string().optional(),
  }),
]);

export type AgentAvailability = z.infer<typeof agentAvailabilitySchema>;

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
