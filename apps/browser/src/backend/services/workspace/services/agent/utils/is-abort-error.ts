export function isAbortError(error: unknown): boolean {
  // Guard against null/undefined
  if (error === null || error === undefined) {
    return false;
  }

  // Check if it's an object (including Error, DOMException, etc.)
  if (typeof error === 'object') {
    // Check if the object has name === 'AbortError'
    if ('name' in error && error.name === 'AbortError') {
      return true;
    }

    // Check if it's a DOMException with code 20 (ABORT_ERR) when available
    // DOMException is available in browser environments
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      if (error.name === 'AbortError' || error.code === 20) {
        return true;
      }
    }

    // Recursively check the 'cause' property if it exists
    if ('cause' in error && error.cause !== undefined) {
      return isAbortError(error.cause);
    }
  }

  return false;
}
