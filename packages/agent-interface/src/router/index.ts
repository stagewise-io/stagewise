import { router } from './trpc';
import {
  type AvailabilityImplementation,
  availabilityRouter,
} from './capabilities/availability';
import { type StateImplementation, stateRouter } from './capabilities/state';
import {
  type MessagingImplementation,
  messagingRouter,
} from './capabilities/messaging';

export interface TransportInterface {
  availability: AvailabilityImplementation;
  messaging: MessagingImplementation;
  state: StateImplementation;
}

export const interfaceRouter = (implementation: TransportInterface) =>
  router({
    availability: availabilityRouter(implementation.availability),
    messaging: messagingRouter(implementation.messaging),
    state: stateRouter(implementation.state),
  });

export type InterfaceRouter = ReturnType<typeof interfaceRouter>;
