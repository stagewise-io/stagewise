import type { AvailabilityImplementation } from '../../router/capabilities/availability';
import {
  type AgentAvailability,
  AgentAvailabilityError,
} from '../../router/capabilities/availability/types';
import { PushController } from './push-controller';

/**
 * AvailabilityManager - Manages agent availability state
 * 
 * This class handles the availability status of an agent, including:
 * - Tracking whether the agent is available or not
 * - Managing error states and error messages
 * - Broadcasting availability changes to subscribers
 * 
 * The availability state is critical for the toolbar to know whether
 * it can interact with the agent or if there are connection issues.
 */
export class AvailabilityManager {
  /**
   * Current availability state of the agent
   */
  private availability: AgentAvailability;
  
  /**
   * Controller for broadcasting availability updates to subscribers
   */
  private readonly controller: PushController<AgentAvailability>;

  constructor() {
    // Initialize with a default "initializing" state
    // This indicates the agent is not yet ready but also not in error
    this.availability = {
      isAvailable: false,
      error: AgentAvailabilityError.NO_CONNECTION,
      errorMessage: 'Initializing',
    } as AgentAvailability;
    
    // Create controller with the initial state
    this.controller = new PushController(this.availability);
    
    // Push the initial state to ensure subscribers get it
    this.controller.push(this.availability);
  }

  /**
   * Gets the current availability state
   * Returns a deep copy to prevent external modifications
   * 
   * @returns The current availability state (by value)
   */
  public get(): AgentAvailability {
    // Return a deep copy to prevent external mutations
    return JSON.parse(JSON.stringify(this.availability));
  }

  /**
   * Sets the availability state and notifies all subscribers
   * 
   * @param available - Whether the agent is available
   * @param error - Error type if not available (required when available=false)
   * @param errorMessage - Optional human-readable error message
   * @throws Error if setting unavailable without providing an error type
   */
  public set(
    available: boolean,
    error?: AgentAvailabilityError,
    errorMessage?: string
  ): void {
    let newAvailability: AgentAvailability;
    
    if (available) {
      // Agent is available - clear any error state
      newAvailability = { isAvailable: true };
    } else {
      // Agent is not available - error information is required
      if (!error) {
        throw new Error(
          "An 'error' type is required when setting availability to false."
        );
      }
      newAvailability = { 
        isAvailable: false, 
        error, 
        errorMessage 
      };
    }
    
    // Update internal state
    this.availability = newAvailability;
    
    // Broadcast the change to all subscribers
    this.controller.push(this.availability);
  }

  /**
   * Creates the implementation object for the router's availability capability
   * This is what the toolbar uses to subscribe to availability changes
   * 
   * @returns The availability implementation for the transport interface
   */
  public createImplementation(): AvailabilityImplementation {
    return {
      /**
       * Returns an AsyncIterable that yields availability updates
       * New subscribers immediately receive the current state
       */
      getAvailability: () => this.controller.subscribe(),
    };
  }
}