/**
 * Disposable interface and base class for services that require cleanup.
 *
 * All services that register handlers, callbacks, or own child services
 * should implement the Disposable interface to ensure proper cleanup.
 */

/**
 * Interface for any service that requires cleanup.
 */
export interface Disposable {
  teardown(): Promise<void> | void;
}

/**
 * Abstract base class for services that require cleanup.
 *
 * Provides:
 * - Protection against double-teardown via `disposed` flag
 * - Guard method `assertNotDisposed()` to prevent access after teardown
 * - Consistent teardown pattern via abstract `onTeardown()` method
 *
 * Services should:
 * - Extend this class
 * - Implement `onTeardown()` with their cleanup logic
 * - Use `assertNotDisposed()` in methods that shouldn't be called after teardown
 */
export abstract class DisposableService implements Disposable {
  protected disposed = false;

  /**
   * Tears down the service. Safe to call multiple times.
   * Subclasses should implement `onTeardown()` instead of overriding this.
   */
  public async teardown(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.onTeardown();
  }

  /**
   * Implement cleanup logic here. Called once during teardown.
   */
  protected abstract onTeardown(): Promise<void> | void;

  /**
   * Throws an error if the service has been disposed.
   * Use this in methods that shouldn't be called after teardown.
   */
  protected assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`${this.constructor.name} has been disposed`);
    }
  }
}
