import { isCustomTRPCError, isTRPCClientError } from '@stagewise/api-client';

export function isInsufficientCreditsError(error: unknown): boolean {
  if (isTRPCClientError(error) && isCustomTRPCError(error))
    return error.data.customError?.code === 'INSUFFICIENT_CREDITS';

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
        // First check if the message contains INSUFFICIENT_CREDITS
        if (parsed.error.message.includes('INSUFFICIENT_CREDITS')) {
          return true;
        }

        // If needed, check for Python-like dict format with regex
        const pythonDictPattern =
          /(?:code)\s*[:=]\s*['"]?INSUFFICIENT_CREDITS['"]?/i;
        if (pythonDictPattern.test(parsed.error.message)) {
          return true;
        }
      }
    } catch {
      // If JSON parsing fails, return false
    }
  }

  return false;
}
