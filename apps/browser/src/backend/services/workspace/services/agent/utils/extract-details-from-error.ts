/**
 * Known AI SDK error types
 */
export type AISDKErrorType =
  | 'AI_APICallError'
  | 'AI_InvalidArgumentError'
  | 'AI_TypeValidationError'
  | 'NetworkError'
  | 'UnknownError';

/**
 * Error details extracted from various error formats
 */
export type ErrorDetails = {
  /** HTTP status code or error code (e.g., "400", "ECONNREFUSED") */
  code: string;
  /** Human-readable error message */
  message: string;
  /** The type of AI SDK error (e.g., "AI_APICallError", "AI_InvalidArgumentError") */
  errorType: AISDKErrorType;
  /** Anthropic-specific error type (e.g., "invalid_request_error", "rate_limit_error") */
  anthropicType?: string;
  /** Request ID for support/debugging */
  requestId?: string;
  [key: string]: any;
};

/**
 * Human-readable messages for common network error codes
 */
const NETWORK_ERROR_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused - Unable to reach the server',
  ENOTFOUND: 'Server not found - DNS lookup failed',
  ETIMEDOUT: 'Connection timed out',
  ECONNRESET: 'Connection was reset by the server',
  EPIPE: 'Connection was closed unexpectedly',
  EHOSTUNREACH: 'Host is unreachable',
  ENETUNREACH: 'Network is unreachable',
  EAI_AGAIN: 'Temporary DNS resolution failure',
};

/**
 * Gets a human-readable message for network error codes
 */
function getNetworkErrorMessage(code: string): string {
  return NETWORK_ERROR_MESSAGES[code] || `Network error: ${code}`;
}

/**
 * Attempts to parse the nested Anthropic error JSON from the proxy message.
 * The proxy wraps Anthropic errors like:
 * '{"type":"error","error":{"type":"invalid_request_error","message":"..."},"request_id":"..."}'
 */
function tryParseAnthropicError(
  message: string,
): { type: string; message: string; requestId?: string } | null {
  // The message often has a suffix like ". Received Model Group=..." that we need to handle
  // First, try to find JSON at the start of the message
  const jsonMatch = message.match(/^\{[\s\S]*?\}(?=\.|$)/);
  const jsonCandidate = jsonMatch ? jsonMatch[0] : message;

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === 'error' &&
      parsed.error &&
      typeof parsed.error === 'object' &&
      typeof parsed.error.message === 'string'
    ) {
      return {
        type: parsed.error.type || 'unknown_error',
        message: parsed.error.message,
        requestId: parsed.request_id,
      };
    }
  } catch {
    // Not valid JSON, continue to other strategies
  }

  return null;
}

/**
 * Strips internal LLM proxy metadata from error messages.
 * Removes suffixes like ". Received Model Group=..." and "Available Model Group Fallbacks=..."
 */
function stripProxyMetadata(message: string): string {
  // Remove "Received Model Group=..." and everything after
  let cleaned = message.split('. Received Model Group')[0];
  // Also handle case where it's at the end without a period
  cleaned = cleaned.split('\nReceived Model Group')[0];
  // Remove "Available Model Group Fallbacks=..." if present
  cleaned = cleaned.split('\nAvailable Model Group Fallbacks')[0];
  return cleaned.trim();
}

/**
 * Parses the responseBody from AI SDK errors.
 * Handles both nested Anthropic errors and plain proxy error messages.
 */
function parseResponseBody(
  body: string,
  statusCode?: number,
  errorType: AISDKErrorType = 'AI_APICallError',
): ErrorDetails | null {
  try {
    const parsed = JSON.parse(body);
    const proxyError = parsed?.error;

    if (!proxyError || typeof proxyError !== 'object') {
      return null;
    }

    const proxyMessage = proxyError.message;
    const proxyCode = proxyError.code || statusCode;

    if (typeof proxyMessage !== 'string') {
      return null;
    }

    // Strategy A: Try to extract nested Anthropic JSON from the message
    const anthropicError = tryParseAnthropicError(proxyMessage);
    if (anthropicError) {
      return {
        code: String(proxyCode),
        message: anthropicError.message,
        errorType,
        anthropicType: anthropicError.type,
        requestId: anthropicError.requestId,
      };
    }

    // Strategy B: Use the plain proxy message (strip internal metadata)
    const cleanMessage = stripProxyMetadata(proxyMessage);
    return {
      code: String(proxyCode),
      message: cleanMessage,
      errorType,
    };
  } catch {
    // JSON parsing failed
    return null;
  }
}

/**
 * Extracts a validation error message from AI_TypeValidationError cause
 */
function extractValidationMessage(cause: unknown): string {
  if (!cause || typeof cause !== 'object') {
    return 'Invalid input';
  }

  const c = cause as Record<string, any>;

  // Handle AI_TypeValidationError with nested cause array
  if (c.name === 'AI_TypeValidationError' && Array.isArray(c.cause)) {
    const errors = c.cause;
    const messages: string[] = [];

    for (const err of errors) {
      if (err && typeof err === 'object') {
        const path = Array.isArray(err.path) ? err.path.join('.') : '';
        const msg = err.message || 'Invalid value';
        messages.push(path ? `${path}: ${msg}` : msg);
      }
    }

    if (messages.length > 0) {
      return messages.join('; ');
    }
  }

  // Fallback to generic message
  if (c.message && typeof c.message === 'string') {
    return c.message;
  }

  return 'Invalid input';
}

/**
 * Extracts error details from various error formats using cascading strategies.
 *
 * Handles:
 * 1. AI SDK errors with responseBody (provider/proxy errors)
 * 2. Direct statusCode + message errors
 * 3. Network errors with cause chain (ECONNREFUSED, etc.)
 * 4. Client validation errors (AI_InvalidArgumentError)
 * 5. Generic errors with a message property
 *
 * @param error - The error object to extract details from
 * @returns ErrorDetails with code and message, or null if extraction fails
 */
export function extractDetailsFromError(error: unknown): ErrorDetails | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const e = error as Record<string, any>;

  // Determine the error type from the error name
  const errorType: AISDKErrorType =
    e.name === 'AI_APICallError'
      ? 'AI_APICallError'
      : e.name === 'AI_InvalidArgumentError'
        ? 'AI_InvalidArgumentError'
        : e.name === 'AI_TypeValidationError'
          ? 'AI_TypeValidationError'
          : 'UnknownError';

  // Strategy 1: Parse responseBody (handles provider/proxy errors from AI SDK)
  if (typeof e.responseBody === 'string') {
    const details = parseResponseBody(e.responseBody, e.statusCode, errorType);
    if (details) {
      return details;
    }
  }

  // Strategy 2: Direct statusCode + message (fallback for partial responses)
  if (e.statusCode && e.message) {
    return {
      code: String(e.statusCode),
      message: stripProxyMetadata(e.message),
      errorType,
    };
  }

  // Strategy 3: Network errors via cause chain
  if (e.cause) {
    // Check for direct network error code in cause
    if (typeof e.cause === 'object' && 'code' in e.cause) {
      const causeCode = e.cause.code;
      if (typeof causeCode === 'string' && NETWORK_ERROR_MESSAGES[causeCode]) {
        return {
          code: causeCode,
          message: getNetworkErrorMessage(causeCode),
          errorType: 'NetworkError',
        };
      }
    }

    // Recurse into cause for nested errors
    const causeDetails = extractDetailsFromError(e.cause);
    if (causeDetails) {
      // Preserve the parent error type if the cause doesn't have a specific one
      return {
        ...causeDetails,
        errorType:
          causeDetails.errorType !== 'UnknownError'
            ? causeDetails.errorType
            : errorType,
      };
    }
  }

  // Strategy 4: Client validation errors (AI_InvalidArgumentError)
  if (e.name === 'AI_InvalidArgumentError') {
    const argumentName = e.argument || 'input';
    const validationMessage = extractValidationMessage(e.cause);
    return {
      code: 'VALIDATION_ERROR',
      message: `Invalid ${argumentName}: ${validationMessage}`,
      errorType: 'AI_InvalidArgumentError',
    };
  }

  // Strategy 5: AI SDK API call errors with name and message
  if (e.name === 'AI_APICallError' && e.message) {
    const code = e.statusCode ? String(e.statusCode) : 'API_ERROR';
    return {
      code,
      message: stripProxyMetadata(e.message),
      errorType: 'AI_APICallError',
    };
  }

  // Strategy 6: Any error with a message property
  if (e.message && typeof e.message === 'string') {
    return {
      code: e.name || 'ERROR',
      message: stripProxyMetadata(e.message),
      errorType,
    };
  }

  return null;
}
