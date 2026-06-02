/**
 * Disposable interface and base class for services that require cleanup.
 *
 * Package-local copy of the browser-side `DisposableService` so
 * `@stagewise/agent-core` services can follow the same lifecycle
 * pattern without depending on host code.
 */

export interface Disposable {
  teardown(): Promise<void> | void;
}

export abstract class DisposableService implements Disposable {
  protected disposed = false;

  public async teardown(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.onTeardown();
  }

  protected abstract onTeardown(): Promise<void> | void;

  protected assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`${this.constructor.name} has been disposed`);
    }
  }
}
