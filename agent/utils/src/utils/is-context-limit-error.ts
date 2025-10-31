export function isContextLimitError(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === 'object' &&
    'responseBody' in error &&
    typeof error.responseBody === 'string'
  ) {
    return (
      error.responseBody.includes('invalid_request') &&
      error.responseBody.includes('prompt is too long')
    );
  }
  return false;
}
