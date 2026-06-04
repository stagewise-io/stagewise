/**
 * Disposable interface and base class for services that require cleanup.
 *
 * Vendored from the browser host so the shell engine has no host import.
 */

/** Interface for any service that requires cleanup. */
export interface Disposable {
  teardown(): Promise<void> | void;
}

/**
 * Abstract base class for services that require cleanup.
 *
 * Provides double-teardown protection, an `assertNotDisposed()` guard, and a
 * consistent teardown pattern via the abstract `onTeardown()` method.
 */
export abstract class DisposableService implements Disposable {
  protected disposed = false;

  /**
   * Tears down the service. Safe to call multiple times.
   * Subclasses should implement `onTeardown()` instead of overriding this.
   */
  public async teardown(): Promise<void> {
    if (this.disposed) return;
    // Set the flag synchronously before awaiting so concurrent callers can't
    // both pass the guard and run `onTeardown()` twice.
    this.disposed = true;
    await this.onTeardown();
  }

  /** Implement cleanup logic here. Called once during teardown. */
  protected abstract onTeardown(): Promise<void> | void;

  /** Throws if the service has been disposed. */
  protected assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`${this.constructor.name} has been disposed`);
    }
  }
}
