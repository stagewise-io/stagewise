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
 * - Stop signals from the toolbar to interrupt processing
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

  /**
   * Set of listeners for stop signals from toolbar
   */
  private stopListeners: Set<() => void> = new Set();

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
   * Adds a listener for stop signals
   * The agent uses this to listen for stop requests from the toolbar
   *
   * @param listener - Function to call when stop is requested
   */
  public addStopListener(listener: () => void): void {
    this.stopListeners.add(listener);
  }

  /**
   * Removes a stop listener
   *
   * @param listener - The listener to remove
   */
  public removeStopListener(listener: () => void): void {
    this.stopListeners.delete(listener);
  }

  /**
   * Clears all stop listeners
   * Used during cleanup to prevent memory leaks
   */
  public clearStopListeners(): void {
    this.stopListeners.clear();
  }

  /**
   * Triggers a stop signal to all listeners
   * Called when the toolbar requests the agent to stop processing
   */
  public triggerStop(): void {
    // Notify all stop listeners, catching any errors to prevent one bad listener from breaking others
    this.stopListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        // Log error but continue with other listeners
        console.error('Error in stop listener:', error);
      }
    });
  }

  /**
   * Creates the implementation object for the router's state capability
   * This is what the toolbar uses to subscribe to state changes
   *
   * @returns The state implementation for the transport interface
   */
  public createImplementation(): StateImplementation {
    const self = this;

    return {
      /**
       * Returns an AsyncIterable that yields state updates
       * New subscribers immediately receive the current state
       */
      getState: () => this.controller.subscribe(),

      /**
       * Called when the toolbar wants to stop the agent's processing
       * Only valid when agent is in a working state
       */
      onStop: async () => {
        // Check if agent is in a stoppable state
        const currentState = self.get();
        const stoppableStates = [
          AgentStateType.THINKING,
          AgentStateType.WORKING,
          AgentStateType.CALLING_TOOL,
        ];

        if (!stoppableStates.includes(currentState.state)) {
          throw new Error(`Cannot stop agent in ${currentState.state} state`);
        }

        // Trigger stop signal to all listeners
        self.triggerStop();
      },
    };
  }
}
