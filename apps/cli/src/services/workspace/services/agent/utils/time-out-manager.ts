/**
 * Manages timeout cleanup with proper cancellation
 */
export class TimeoutManager {
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Sets a timeout with a specific key
   */
  set(key: string, callback: () => void, duration: number): void {
    // Clear existing timeout if any
    this.clear(key);

    const timeout = setTimeout(callback, duration);
    this.timeouts.set(key, timeout);
  }

  /**
   * Clears a specific timeout
   */
  clear(key: string): void {
    const timeout = this.timeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(key);
    }
  }

  /**
   * Clears all timeouts
   */
  clearAll(): void {
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();
  }

  /**
   * Checks if a timeout exists
   */
  has(key: string): boolean {
    return this.timeouts.has(key);
  }
}
