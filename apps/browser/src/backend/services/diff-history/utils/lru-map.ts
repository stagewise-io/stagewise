/**
 * Lightweight LRU cache built on top of `Map`'s insertion-order guarantee.
 *
 * - `get()` promotes the entry to most-recent.
 * - `set()` evicts the least-recently-used entry when the cap is exceeded.
 * - `has()` does **not** promote (read-only probe).
 *
 * All other `Map` methods (iteration, `delete`, `clear`, `size`, …) work
 * unchanged.
 */
export class LRUMap<K, V> extends Map<K, V> {
  private readonly maxSize: number;

  constructor(maxSize: number) {
    super();
    if (!Number.isInteger(maxSize) || maxSize < 1)
      throw new Error(
        `LRUMap: maxSize must be a positive integer, got ${maxSize}`,
      );

    this.maxSize = maxSize;
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    const val = super.get(key)!;
    // Promote to most-recent by re-inserting at the end.
    super.delete(key);
    super.set(key, val);
    return val;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) {
      // Key already present — delete first so re-insertion moves it to end.
      super.delete(key);
    } else if (this.size >= this.maxSize) {
      // At capacity — evict the least-recently-used (first) entry.
      const oldest = this.keys().next().value;
      if (oldest !== undefined) super.delete(oldest);
    }
    return super.set(key, value);
  }
}
