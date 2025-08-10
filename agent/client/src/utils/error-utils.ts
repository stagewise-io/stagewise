import {
  isTRPCClientError,
  isCustomTRPCError,
  getCustomErrorData,
} from '@stagewise/api-client';

/**
 * Utility functions for formatting and handling errors in the agent
 */

/**
 * Sanitizes error messages to remove potentially sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  // Remove common patterns that might contain secrets
  const patterns = [
    // API keys and tokens
    /\b(api[_-]?key|token|secret|password|auth|bearer)\s*[:=]\s*['"]?[^\s'"]+/gi,
    // URLs with credentials - safe pattern to avoid ReDoS
    /https?:\/\/[a-zA-Z0-9._-]{1,50}:[a-zA-Z0-9._-]{1,50}@[a-zA-Z0-9.-]{1,100}/gi,
    // Email addresses (might be sensitive)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ];

  let sanitized = message;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

/**
 * Extracts the most meaningful error message from an error object
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';

  if (isTRPCClientError(error)) {
    if (isCustomTRPCError(error)) {
      const customErrorData = getCustomErrorData(error);
      switch (customErrorData?.code) {
        case 'INSUFFICIENT_CREDITS':
          return `Insufficient credits. Visit https://console.stagewise.io to buy more credits.`;
        case 'RATE_LIMIT_EXCEEDED':
          return `Rate limit exceeded. Please reach out to https://discord.gg/6gjx9ESbhf to resolve this issue.`;
        default:
          return error.message;
      }
    }
  }

  if (error instanceof Error) {
    // For TRPC errors, try to get the detailed message
    if ('data' in error && error.data && typeof error.data === 'object') {
      const data = error.data as any;
      if (data.message) return data.message;
      if (data.code) return `${data.code}: ${error.message}`;
    }
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }
  }

  return JSON.stringify(error);
}

/**
 * Formats an error into a detailed, readable description for logging
 */
export function formatErrorDescription(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, any>,
): string {
  const errorMessage = extractErrorMessage(error);
  const sanitizedMessage = sanitizeErrorMessage(errorMessage);

  const parts: string[] = [`${context}: ${sanitizedMessage}`];

  // Add error type if it's an Error instance
  if (error instanceof Error) {
    parts.push(`[${error.constructor.name}]`);
  }

  // Add additional context if provided
  if (additionalInfo && Object.keys(additionalInfo).length > 0) {
    const sanitizedInfo: Record<string, any> = {};
    for (const [key, value] of Object.entries(additionalInfo)) {
      if (typeof value === 'string') {
        sanitizedInfo[key] = sanitizeErrorMessage(value);
      } else if (value === undefined || value === null) {
        sanitizedInfo[key] = value;
      } else if (typeof value === 'object') {
        // Don't include complex objects to avoid circular references
        sanitizedInfo[key] = '[Object]';
      } else {
        sanitizedInfo[key] = value;
      }
    }

    const infoStr = Object.entries(sanitizedInfo)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    if (infoStr) {
      parts.push(`(${infoStr})`);
    }
  }

  return parts.join(' ');
}

/**
 * Creates a structured error description for specific error scenarios
 */
export const ErrorDescriptions = {
  recursionDepthExceeded: (currentDepth: number, maxDepth: number) =>
    formatErrorDescription(
      'Maximum recursion depth exceeded',
      new Error(`Reached depth ${currentDepth} of ${maxDepth}`),
      { currentDepth, maxDepth },
    ),

  authenticationFailed: (error: unknown, retryCount: number) =>
    formatErrorDescription('Authentication failed', error, {
      retryCount,
      authRequired: true,
    }),

  toolCallFailed: (
    toolName: string,
    error: unknown,
    args?: any,
    duration?: number,
  ) => {
    const sanitizedArgs = args
      ? `${JSON.stringify(args).substring(0, 200)}...`
      : undefined;
    return formatErrorDescription(`Tool call '${toolName}' failed`, error, {
      tool: toolName,
      args: sanitizedArgs,
      duration: duration ? `${duration}ms` : undefined,
    });
  },

  streamTimeout: (timeout: number, operation: string) =>
    formatErrorDescription(
      'Stream processing timeout',
      new Error(`Timeout after ${timeout}ms`),
      { timeout, operation },
    ),

  apiCallFailed: (operation: string, error: unknown, duration?: number) =>
    formatErrorDescription(`API call failed`, error, {
      operation,
      duration: duration ? `${duration}ms` : undefined,
    }),

  initializationFailed: (component: string, error: unknown) =>
    formatErrorDescription(`Failed to initialize ${component}`, error, {
      component,
    }),

  browserToolError: (toolName: string, error: unknown) =>
    formatErrorDescription(`Browser tool execution failed`, error, {
      tool: toolName,
      runtime: 'browser',
    }),

  parseError: (operation: string, error: unknown, input?: string) =>
    formatErrorDescription(`Failed to parse ${operation}`, error, {
      operation,
      inputLength: input?.length,
    }),
};
