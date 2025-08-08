import { router } from './trpc';
import {
  type AvailabilityImplementation,
  availabilityRouter,
} from './capabilities/availability';
import { type StateImplementation, stateRouter } from './capabilities/state';
import {
  type ToolCallingImplementation,
  toolCallingRouter,
} from './capabilities/tool-calling';
import {
  type MessagingImplementation,
  messagingRouter,
} from './capabilities/messaging';
import { type UndoImplementation, undoRouter } from './capabilities/undo';

export interface TransportInterface {
  availability: AvailabilityImplementation;
  messaging: MessagingImplementation;
  state: StateImplementation;
  toolCalling?: ToolCallingImplementation;
  undo?: UndoImplementation;
}

export const interfaceRouter = (implementation: TransportInterface) =>
  router({
    availability: availabilityRouter(implementation.availability),
    messaging: messagingRouter(implementation.messaging),
    state: stateRouter(implementation.state),
    toolCalling: toolCallingRouter(implementation.toolCalling),
    undo: undoRouter(implementation.undo),
  });

export type InterfaceRouter = ReturnType<typeof interfaceRouter>;
