/**
 * Checks if an error is an authentication error
 * @param error - The error to check
 * @returns True if the error is an authentication error, false otherwise
 */
export function isAuthenticationError(error: any): boolean {
  // Check for TRPC error with UNAUTHORIZED code
  if (error?.data?.code === 'UNAUTHORIZED') return true;

  // Check for HTTP 401 status
  if (error?.data?.httpStatus === 401) return true;

  // Check error message for auth-related keywords
  const errorMessage = error?.message || '';
  const authErrorPatterns = [
    'unauthorized',
    'authentication',
    'invalid token',
    'expired token',
    '401',
  ];

  return authErrorPatterns.some((pattern) =>
    errorMessage.toLowerCase().includes(pattern),
  );
}
