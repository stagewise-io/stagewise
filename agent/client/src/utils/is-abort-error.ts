export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error &&
      error.name === 'TRPCClientError' &&
      error.cause instanceof Error &&
      error.cause.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
