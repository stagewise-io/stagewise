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
import {
  type ChatImplementation,
  chatRouter,
} from './capabilities/chat';

export interface TransportInterface {
  availability: AvailabilityImplementation;
  messaging: MessagingImplementation;
  state: StateImplementation;
  chat?: ChatImplementation;
}

export const interfaceRouter = (implementation: TransportInterface) => {
  const routes = {
    availability: availabilityRouter(implementation.availability),
    messaging: messagingRouter(implementation.messaging),
    state: stateRouter(implementation.state),
    ...(implementation.chat ? { chat: chatRouter(implementation.chat) } : {}),
  };
  
  return router(routes);
};

export type InterfaceRouter = ReturnType<typeof interfaceRouter>;
