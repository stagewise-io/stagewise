import { isCustomTRPCError, isTRPCClientError } from '@stagewise/api-client';

export function isInsufficientCreditsError(error: any): boolean {
  if (isTRPCClientError(error) && isCustomTRPCError(error))
    return error.data.customError?.code === 'INSUFFICIENT_CREDITS';
  else if (
    'responseBody' in error &&
    typeof error.responseBody === 'string' &&
    error.responseBody !== null &&
    'code' in JSON.parse(error.responseBody) &&
    JSON.parse(error.responseBody).code === 'INSUFFICIENT_CREDITS'
  )
    return true;

  console.log(error);

  return false;
}
