import { isCustomTRPCError, isTRPCClientError } from '@stagewise/api-client';

export function isInsufficientCreditsError(error: any): boolean {
  if (isTRPCClientError(error) && isCustomTRPCError(error))
    return error.data.customError?.code === 'INSUFFICIENT_CREDITS';

  // Handle case where responseBody is a string that needs parsing
  if (
    'responseBody' in error &&
    typeof error.responseBody === 'string' &&
    error.responseBody !== null
  ) {
    try {
      const parsed = JSON.parse(error.responseBody);
      if (
        'error' in parsed &&
        'message' in parsed.error &&
        typeof parsed.error.message === 'string'
      ) {
        try {
          // Parse the stringified Python dict in the message field
          // Convert Python dict syntax to JSON syntax
          const pythonDictStr = parsed.error.message
            .replace(/'/g, '"') // Replace single quotes with double quotes
            .replace(/True/g, 'true') // Replace Python True with JSON true
            .replace(/False/g, 'false') // Replace Python False with JSON false
            .replace(/None/g, 'null'); // Replace Python None with JSON null

          const messageObj = JSON.parse(pythonDictStr);
          if (messageObj.code === 'INSUFFICIENT_CREDITS') {
            return true;
          }
        } catch {
          // If parsing the Python dict fails, fall back to string check
          if (parsed.error.message.includes('INSUFFICIENT_CREDITS')) {
            return true;
          }
        }
      }
    } catch {
      // If JSON parsing fails, continue to other checks
    }
  }

  console.log(error);

  return false;
}
