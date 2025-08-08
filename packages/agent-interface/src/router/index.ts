import { type ChatImplementation, chatRouter } from './capabilities/chat';

export interface TransportInterface {
  chat: ChatImplementation;
}

export const interfaceRouter = (implementation: TransportInterface) => {
  return chatRouter(implementation.chat);
};

export type InterfaceRouter = ReturnType<typeof interfaceRouter>;
