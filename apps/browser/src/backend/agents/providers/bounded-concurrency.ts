export type BoundedConcurrencyOptions<R> = {
  signal?: AbortSignal;
  fallback: (value: R | undefined, index: number) => R;
};

/**
 * Map values with a bounded worker pool. Results preserve input order. Once
 * cancelled, no additional work is scheduled and incomplete values use the
 * caller-provided fallback.
 */
export async function mapWithBoundedConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
  { signal, fallback }: BoundedConcurrencyOptions<R>,
): Promise<R[]> {
  const results = new Array<R | undefined>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (!signal?.aborted) {
      const index = nextIndex++;
      if (index >= values.length) return;
      try {
        results[index] = await mapper(values[index]!, index);
      } catch {
        // An individual enrichment failure must not fail discovery.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), values.length) }, worker),
  );
  return Array.from({ length: values.length }, (_, index) => {
    const result = results[index];
    return result === undefined ? fallback(result, index) : result;
  });
}
