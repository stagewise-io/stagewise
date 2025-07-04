import { z } from 'zod';

export enum AgentAvailabilityError {
  NO_CONNECTION = 'no_connection',
  NO_AUTHENTICATION = 'no_authentication',
  INCOMPATIBLE_VERSION = 'incompatible_version',
  OTHER = 'other',
}

export const agentAvailabilitySchema = z.discriminatedUnion('isAvailable', [
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
