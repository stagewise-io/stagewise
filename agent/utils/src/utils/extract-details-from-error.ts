type ErrorDetails = {
  code: string;
  message: string;
  [key: string]: any;
};

export function extractDetailsFromError(error: unknown): ErrorDetails | null {
  // Handle case where responseBody is a string that needs parsing
  if (
    error !== null &&
    typeof error === 'object' &&
    'responseBody' in error &&
    typeof error.responseBody === 'string'
  ) {
    try {
      const parsed = JSON.parse(error.responseBody);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        parsed.error !== null &&
        typeof parsed.error === 'object' &&
        'message' in parsed.error &&
        typeof parsed.error.message === 'string'
      ) {
        const parsedMessage = JSON.parse(parsed.error.message);
        return parsedMessage;
      }
    } catch {
      return null;
      // If JSON parsing fails, return null
    }
  }

  return null;
}
