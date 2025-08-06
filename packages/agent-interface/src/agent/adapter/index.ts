/**
 * Agent Adapter Module Exports
 * 
 * This module provides the components for building agent-toolbar communication.
 * The main export is the AgentTransportAdapter, but individual managers
 * are also exported for advanced use cases.
 */

// Main adapter class - this is what most agent implementations will use
export { AgentTransportAdapter, type AdapterOptions } from '../adapter';

// Utility class for managing async streams
export { PushController } from './push-controller';

// Individual manager classes (for advanced use cases)
export { AvailabilityManager } from './availability-manager';
export { StateManager } from './state-manager';
export { MessagingManager } from './messaging-manager';
export { ChatManager } from './chat-manager';