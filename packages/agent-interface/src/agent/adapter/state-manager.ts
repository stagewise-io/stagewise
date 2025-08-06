import type { StateImplementation } from '../../router/capabilities/state';
import {
  type AgentState,
  AgentStateType,
} from '../../router/capabilities/state/types';
import { PushController } from './push-controller';

/**
 * StateManager - Manages agent state
 * 
 * This class handles the operational state of an agent, tracking:
 * - Current state (IDLE, WORKING, CALLING_TOOL, etc.)
 * - Optional description of what the agent is doing
 * - Broadcasting state changes to subscribers
 * 
 * The state helps the toolbar show what the agent is currently doing
 * and whether it can accept new requests.
 */
export class StateManager {
  /**
   * Current operational state of the agent
   */
  private state: AgentState;
  
  /**
   * Controller for broadcasting state updates to subscribers
   */
  private readonly controller: PushController<AgentState>;

  constructor() {
    // Initialize with IDLE state - agent is ready but not doing anything
    this.state = { state: AgentStateType.IDLE };
    
    // Create controller with the initial state
    this.controller = new PushController(this.state);
    
    // Push the initial state to ensure subscribers get it
    this.controller.push(this.state);
  }

  /**
   * Gets the current agent state
   * Returns a deep copy to prevent external modifications
   * 
   * @returns The current agent state (by value)
   */
  public get(): AgentState {
    // Return a deep copy to prevent external mutations
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Sets the agent state and notifies all subscribers
   * 
   * @param state - The new state type (IDLE, WORKING, etc.)
   * @param description - Optional description of what the agent is doing
   *                      This is shown to users in the UI for context
   */
  public set(state: AgentStateType, description?: string): void {
    // Update internal state with new values
    this.state = { state, description };
    
    // Broadcast the change to all subscribers
    this.controller.push(this.state);
  }

  /**
   * Creates the implementation object for the router's state capability
   * This is what the toolbar uses to subscribe to state changes
   * 
   * @returns The state implementation for the transport interface
   */
  public createImplementation(): StateImplementation {
    return {
      /**
       * Returns an AsyncIterable that yields state updates
       * New subscribers immediately receive the current state
       */
      getState: () => this.controller.subscribe(),
    };
  }
}