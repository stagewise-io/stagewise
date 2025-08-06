/**
 * PushController - Stream Management Utility
 * 
 * A controller for managing an AsyncIterable stream that allows pushing new values
 * to all subscribers. This is used throughout the adapter to manage real-time updates
 * for availability, state, messages, and chat updates.
 * 
 * Key features:
 * - Push values to multiple subscribers simultaneously
 * - New subscribers immediately receive the latest value upon subscription
 * - Handles async iteration protocol correctly
 * - Manages subscriber lifecycle and cleanup
 */
export class PushController<T> {
  /**
   * The most recently pushed value, used to immediately provide
   * new subscribers with the current state
   */
  private latestValue: T | undefined;
  
  /**
   * Set of active subscriber callbacks that receive pushed values
   */
  private subscribers: Set<(value: T) => void> = new Set();

  /**
   * Creates a new PushController with an optional initial value
   * @param initialValue - The initial value to set (optional)
   */
  constructor(initialValue?: T) {
    this.latestValue = initialValue;
  }

  /**
   * Pushes a new value to all current subscribers and updates the latest value.
   * This is the primary method for sending updates through the stream.
   * 
   * @param value - The new value to push to all subscribers
   */
  public push(value: T): void {
    // Store the latest value for new subscribers
    this.latestValue = value;
    
    // Notify all current subscribers of the new value
    for (const subscriber of this.subscribers) {
      subscriber(value);
    }
  }

  /**
   * Retrieves the most recently pushed value.
   * Useful for synchronously checking the current state.
   * 
   * @returns The latest value, or undefined if no value has been pushed
   */
  public getLatestValue(): T | undefined {
    return this.latestValue;
  }

  /**
   * Creates and returns a new AsyncIterable for a consumer.
   * Each call creates an independent subscription that will:
   * 1. Immediately yield the latest value (if one exists)
   * 2. Yield all subsequent values pushed to the controller
   * 
   * @returns An async iterable that yields values pushed to the controller
   */
  public subscribe(): AsyncIterable<T> {
    const controller = this;
    
    // Queues for managing async iteration
    // pullQueue: Resolvers waiting for values
    // pushQueue: Values waiting to be consumed
    let pullQueue: ((value: IteratorResult<T>) => void)[] = [];
    let pushQueue: T[] = [];
    let done = false;

    /**
     * Internal helper to handle value delivery
     * Either resolves a waiting pull or queues the value
     */
    const pushValue = (value: T) => {
      if (pullQueue.length > 0) {
        // If someone is waiting for a value, deliver it immediately
        pullQueue.shift()!({ value, done: false });
      } else {
        // Otherwise, queue it for later consumption
        pushQueue.push(value);
      }
    };

    /**
     * Listener function that receives pushed values
     * and forwards them to the iterator
     */
    const listener = (value: T) => {
      if (!done) {
        pushValue(value);
      }
    };

    return {
      [Symbol.asyncIterator]: () => {
        // Immediately provide the latest value to new subscribers
        // This ensures they start with the current state
        if (controller.getLatestValue() !== undefined) {
          pushValue(controller.getLatestValue()!);
        }
        
        // Register this listener to receive future updates
        controller.subscribers.add(listener);

        return {
          /**
           * Gets the next value from the stream
           * Either returns a queued value or waits for the next push
           */
          next: (): Promise<IteratorResult<T>> => {
            return new Promise((resolve) => {
              if (pushQueue.length > 0) {
                // Return queued value immediately
                resolve({ value: pushQueue.shift()!, done: false });
              } else if (done) {
                // Iterator has been closed
                resolve({ value: undefined, done: true });
              } else {
                // Wait for next value to be pushed
                pullQueue.push(resolve);
              }
            });
          },
          
          /**
           * Cleanup method called when the iterator is closed
           * Removes the listener and cleans up queues
           */
          return: async (): Promise<IteratorResult<T>> => {
            done = true;
            
            // Unregister from receiving updates
            controller.subscribers.delete(listener);
            
            // Resolve any pending pulls with done=true
            pullQueue.forEach((resolve) =>
              resolve({ value: undefined, done: true }),
            );
            
            // Clear queues to free memory
            pullQueue = [];
            pushQueue = [];
            
            return { value: undefined, done: true };
          },
        };
      },
    };
  }
}