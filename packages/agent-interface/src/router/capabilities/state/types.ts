import { z } from 'zod';

export enum AgentStateType {
  IDLE = 'idle',
  THINKING = 'thinking',
  WORKING = 'working',
  CALLING_TOOL = 'calling_tool',
  WAITING_FOR_USER_RESPONSE = 'waiting_for_user_response',
  FAILED = 'failed',
  COMPLETED = 'completed', // You should stay in this state for at least a second. The toolbar may show this state for a longer duration.
}

export const agentStateSchema = z.object({
  state: z.nativeEnum(AgentStateType),
  description: z.string().min(3).max(128).optional(),
});

export type AgentState = z.infer<typeof agentStateSchema>;
