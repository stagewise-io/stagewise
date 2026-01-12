import { ChromiumErrorNames } from './codes';

/**
 * Error category types
 */
export type ErrorCategory =
  | 'certificate'
  | 'network'
  | 'dns'
  | 'protocol'
  | 'cache'
  | 'security'
  | 'generic'
  | 'unknown';

/**
 * Error classification result with user-friendly messaging
 */
export interface ErrorClassification {
  /** Whether this error is safety-relevant (cert or connection errors) */
  isSafetyRelevant: boolean;
  /** Category of the error */
  category: ErrorCategory;
  /** User-friendly title for the error */
  userFriendlyTitle: string;
  /** User-friendly explanation message */
  userFriendlyMessage: string;
  /** Whether this is a dangerous/blocking error (red warning styling) */
  isDangerous: boolean;
}

// =============================================================================
// Error Code Range Constants
// =============================================================================

/** Generic errors: -1 to -99 */
const GENERIC_ERROR_MIN = -99;
const GENERIC_ERROR_MAX = -1;

/** Network/connection errors: -100 to -199 */
const NETWORK_ERROR_MIN = -199;
const NETWORK_ERROR_MAX = -100;

/** Certificate errors: -200 to -219 */
const CERT_ERROR_MIN = -219;
const CERT_ERROR_MAX = -200;

/** Protocol/URL errors: -300 to -399 */
const PROTOCOL_ERROR_MIN = -399;
const PROTOCOL_ERROR_MAX = -300;

/** Cache errors: -400 to -413 */
const CACHE_ERROR_MIN = -413;
const CACHE_ERROR_MAX = -400;

/** Security errors (non-cert): -500 to -599 */
const SECURITY_ERROR_MIN = -599;
const SECURITY_ERROR_MAX = -500;

/** DNS errors: -800 to -820 */
const DNS_ERROR_MIN = -820;
const DNS_ERROR_MAX = -800;

// =============================================================================
// SSL/TLS-Related Network Errors (Dangerous)
// =============================================================================

/**
 * SSL/TLS-related network error codes that are security-relevant and should show danger styling.
 * These errors indicate potential security issues like:
 * - Certificate problems
 * - SSL/TLS protocol errors
 * - Man-in-the-middle attack detection
 * - Key/cipher issues
 */
const SSL_RELATED_NETWORK_ERRORS = new Set([
  -107, // SSL_PROTOCOL_ERROR
  -110, // SSL_CLIENT_AUTH_CERT_NEEDED
  -113, // SSL_VERSION_OR_CIPHER_MISMATCH
  -114, // SSL_RENEGOTIATION_REQUESTED
  -117, // BAD_SSL_CLIENT_AUTH_CERT
  -123, // SSL_NO_RENEGOTIATION
  -125, // SSL_DECOMPRESSION_FAILURE_ALERT
  -126, // SSL_BAD_RECORD_MAC_ALERT
  -134, // SSL_CLIENT_AUTH_PRIVATE_KEY_ACCESS_DENIED
  -135, // SSL_CLIENT_AUTH_CERT_NO_PRIVATE_KEY
  -136, // PROXY_CERTIFICATE_INVALID
  -141, // SSL_CLIENT_AUTH_SIGNATURE_FAILED
  -148, // SSL_HANDSHAKE_NOT_COMPLETED
  -149, // SSL_BAD_PEER_PUBLIC_KEY
  -150, // SSL_PINNED_KEY_NOT_IN_CERT_CHAIN
  -153, // SSL_DECRYPT_ERROR_ALERT
  -156, // SSL_SERVER_CERT_CHANGED
  -159, // SSL_UNRECOGNIZED_NAME_ALERT
  -164, // SSL_CLIENT_AUTH_CERT_BAD_FORMAT
  -167, // SSL_SERVER_CERT_BAD_FORMAT
  -172, // SSL_OBSOLETE_CIPHER
  -177, // SSL_CLIENT_AUTH_NO_COMMON_ALGORITHMS
  -180, // TLS13_DOWNGRADE_DETECTED
  -181, // SSL_KEY_USAGE_INCOMPATIBLE
  -184, // ECH_FALLBACK_CERTIFICATE_INVALID
]);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an error code falls within a range (inclusive)
 */
function isInRange(errorCode: number, min: number, max: number): boolean {
  return errorCode >= min && errorCode <= max;
}

/**
 * Check if a network error code is SSL/TLS-related (security-relevant)
 */
function isSslRelatedError(errorCode: number): boolean {
  return SSL_RELATED_NETWORK_ERRORS.has(errorCode);
}

/**
 * Determine the category of an error code
 */
function getErrorCategory(errorCode: number): ErrorCategory {
  if (isInRange(errorCode, CERT_ERROR_MIN, CERT_ERROR_MAX)) {
    return 'certificate';
  }
  if (isInRange(errorCode, NETWORK_ERROR_MIN, NETWORK_ERROR_MAX)) {
    return 'network';
  }
  if (isInRange(errorCode, DNS_ERROR_MIN, DNS_ERROR_MAX)) {
    return 'dns';
  }
  if (isInRange(errorCode, PROTOCOL_ERROR_MIN, PROTOCOL_ERROR_MAX)) {
    return 'protocol';
  }
  if (isInRange(errorCode, CACHE_ERROR_MIN, CACHE_ERROR_MAX)) {
    return 'cache';
  }
  if (isInRange(errorCode, SECURITY_ERROR_MIN, SECURITY_ERROR_MAX)) {
    return 'security';
  }
  if (isInRange(errorCode, GENERIC_ERROR_MIN, GENERIC_ERROR_MAX)) {
    return 'generic';
  }
  return 'unknown';
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if an error code is safety-relevant.
 * Safety-relevant errors should always navigate the full page to the error page,
 * even for subframe errors.
 *
 * Uses classifyError internally to ensure consistent categorization.
 */
export function isSafetyRelevantError(errorCode: number): boolean {
  return classifyError(errorCode).isSafetyRelevant;
}

/**
 * Classify an error code and provide user-friendly information.
 * Uses getErrorCategory() as the single source of truth for categorization.
 */
export function classifyError(errorCode: number): ErrorClassification {
  const category = getErrorCategory(errorCode);

  switch (category) {
    case 'certificate':
      return {
        isSafetyRelevant: true,
        category,
        isDangerous: true,
        userFriendlyTitle: 'Security Warning',
        userFriendlyMessage: getCertificateErrorMessage(errorCode),
      };

    case 'network': {
      const isSslError = isSslRelatedError(errorCode);
      return {
        isSafetyRelevant: true,
        category,
        isDangerous: isSslError,
        userFriendlyTitle: isSslError
          ? 'Secure Connection Failed'
          : getNetworkErrorTitle(errorCode),
        userFriendlyMessage: getNetworkErrorMessage(errorCode),
      };
    }

    case 'dns':
      return {
        isSafetyRelevant: false,
        category,
        isDangerous: false,
        userFriendlyTitle: "Can't Find Server",
        userFriendlyMessage: getDnsErrorMessage(errorCode),
      };

    case 'cache':
      return {
        isSafetyRelevant: false,
        category,
        isDangerous: false,
        userFriendlyTitle: 'Cache Error',
        userFriendlyMessage:
          'There was a problem reading cached data. Try reloading the page.',
      };

    case 'protocol':
      return {
        isSafetyRelevant: false,
        category,
        isDangerous: false,
        userFriendlyTitle: 'Page Load Failed',
        userFriendlyMessage: getProtocolErrorMessage(errorCode),
      };

    case 'security':
      return {
        isSafetyRelevant: false,
        category,
        isDangerous: true,
        userFriendlyTitle: 'Security Error',
        userFriendlyMessage:
          'The page could not be loaded due to security restrictions.',
      };

    case 'generic':
      return {
        isSafetyRelevant: false,
        category,
        isDangerous: false,
        userFriendlyTitle: 'Page Load Failed',
        userFriendlyMessage: getGenericErrorMessage(errorCode),
      };

    case 'unknown':
    default:
      // Handle unknown error codes gracefully
      return {
        isSafetyRelevant: false,
        category: 'unknown',
        isDangerous: false,
        userFriendlyTitle: 'Page Load Failed',
        userFriendlyMessage: getGenericErrorMessage(errorCode),
      };
  }
}

/**
 * Get user-friendly message for certificate errors
 */
function getCertificateErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case -200: // CERT_COMMON_NAME_INVALID
      return "The certificate for this website is not valid. The website's identity cannot be verified.";
    case -201: // CERT_DATE_INVALID
      return 'The security certificate for this website has expired or is not yet valid.';
    case -202: // CERT_AUTHORITY_INVALID
      return 'The security certificate for this website was signed by an untrusted authority.';
    case -203: // CERT_CONTAINS_ERRORS
      return 'The security certificate for this website contains errors.';
    case -204: // CERT_NO_REVOCATION_MECHANISM
      return "The security certificate's revocation status could not be verified.";
    case -205: // CERT_UNABLE_TO_CHECK_REVOCATION
      return 'Unable to check if the security certificate has been revoked.';
    case -206: // CERT_REVOKED
      return 'The security certificate for this website has been revoked.';
    case -207: // CERT_INVALID
      return 'The security certificate for this website is invalid.';
    case -208: // CERT_WEAK_SIGNATURE_ALGORITHM
      return 'The security certificate uses a weak signature algorithm.';
    case -210: // CERT_NON_UNIQUE_NAME
      return 'The certificate contains a non-unique name.';
    case -211: // CERT_WEAK_KEY
      return 'The security certificate uses a weak cryptographic key.';
    case -212: // CERT_NAME_CONSTRAINT_VIOLATION
      return 'The certificate violates name constraints.';
    case -213: // CERT_VALIDITY_TOO_LONG
      return 'The certificate validity period is too long.';
    case -214: // CERTIFICATE_TRANSPARENCY_REQUIRED
      return 'Certificate transparency is required but missing.';
    case -215: // CERT_SYMANTEC_LEGACY
      return 'The certificate was issued by a distrusted authority.';
    case -216: // CERT_KNOWN_INTERCEPTION_BLOCKED
      return 'Connection was blocked due to known certificate interception.';
    case -217: // SSL_OBSOLETE_CIPHER
      return 'The connection uses an obsolete encryption cipher.';
    default:
      return 'There is a problem with the security certificate for this website. Your connection is not secure.';
  }
}

/**
 * Get user-friendly title for network errors
 */
function getNetworkErrorTitle(errorCode: number): string {
  switch (errorCode) {
    case -105: // NAME_NOT_RESOLVED
    case -106: // INTERNET_DISCONNECTED
      return "Can't Connect";
    case -118: // CONNECTION_TIMED_OUT
      return 'Connection Timed Out';
    case -102: // CONNECTION_REFUSED
      return 'Connection Refused';
    case -101: // CONNECTION_RESET
      return 'Connection Reset';
    default:
      return 'Connection Failed';
  }
}

/**
 * Get user-friendly message for network/connection errors
 */
function getNetworkErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case -100: // CONNECTION_CLOSED
      return 'The connection was closed unexpectedly.';
    case -101: // CONNECTION_RESET
      return 'The connection was reset by the server.';
    case -102: // CONNECTION_REFUSED
      return 'The server refused the connection. It may be offline or blocking requests.';
    case -103: // CONNECTION_ABORTED
      return 'The connection was aborted.';
    case -104: // CONNECTION_FAILED
      return 'Could not establish a connection to the server.';
    case -105: // NAME_NOT_RESOLVED
      return "The server's address could not be found. Check the URL and your internet connection.";
    case -106: // INTERNET_DISCONNECTED
      return 'You appear to be offline. Check your internet connection.';
    case -107: // SSL_PROTOCOL_ERROR
      return 'A secure connection could not be established due to a protocol error.';
    case -108: // ADDRESS_INVALID
      return 'The server address is invalid.';
    case -109: // ADDRESS_UNREACHABLE
      return 'The server address is unreachable.';
    case -110: // SSL_CLIENT_AUTH_CERT_NEEDED
      return 'The server requires a client certificate for authentication.';
    case -111: // TUNNEL_CONNECTION_FAILED
      return 'Could not establish a tunnel connection through the proxy.';
    case -112: // NO_SSL_VERSIONS_ENABLED
      return 'No supported SSL versions are enabled.';
    case -113: // SSL_VERSION_OR_CIPHER_MISMATCH
      return 'Could not negotiate a secure connection due to version or cipher mismatch.';
    case -114: // SSL_RENEGOTIATION_REQUESTED
      return 'The server requested SSL renegotiation.';
    case -115: // PROXY_AUTH_UNSUPPORTED
      return 'The proxy requires an unsupported authentication method.';
    case -117: // BAD_SSL_CLIENT_AUTH_CERT
      return 'The client certificate is invalid or rejected by the server.';
    case -118: // CONNECTION_TIMED_OUT
      return 'The connection timed out. The server may be slow or unresponsive.';
    case -119: // HOST_RESOLVER_QUEUE_TOO_LARGE
      return 'Too many DNS requests are pending.';
    case -120: // SOCKS_CONNECTION_FAILED
      return 'Could not establish a connection through the SOCKS proxy.';
    case -121: // SOCKS_CONNECTION_HOST_UNREACHABLE
      return 'The SOCKS proxy could not reach the destination server.';
    case -122: // ALPN_NEGOTIATION_FAILED
      return 'Application protocol negotiation failed.';
    case -123: // SSL_NO_RENEGOTIATION
      return 'The server refused SSL renegotiation.';
    case -124: // WINSOCK_UNEXPECTED_WRITTEN_BYTES
      return 'An unexpected network error occurred.';
    case -125: // SSL_DECOMPRESSION_FAILURE_ALERT
      return 'SSL decompression failed.';
    case -126: // SSL_BAD_RECORD_MAC_ALERT
      return 'The SSL record had an invalid MAC.';
    case -127: // PROXY_AUTH_REQUESTED
      return 'The proxy requires authentication.';
    case -130: // PROXY_CONNECTION_FAILED
      return 'Could not connect to the proxy server.';
    case -131: // MANDATORY_PROXY_CONFIGURATION_FAILED
      return 'The mandatory proxy configuration failed.';
    case -133: // PRECONNECT_MAX_SOCKET_LIMIT
      return 'Too many pre-connect sockets.';
    case -134: // SSL_CLIENT_AUTH_PRIVATE_KEY_ACCESS_DENIED
      return 'Access to the client certificate private key was denied.';
    case -135: // SSL_CLIENT_AUTH_CERT_NO_PRIVATE_KEY
      return 'The client certificate has no associated private key.';
    case -136: // PROXY_CERTIFICATE_INVALID
      return 'The proxy certificate is invalid.';
    case -137: // NAME_RESOLUTION_FAILED
      return 'Could not resolve the server name.';
    case -138: // NETWORK_ACCESS_DENIED
      return 'Network access was denied.';
    case -139: // TEMPORARILY_THROTTLED
      return 'The request was temporarily throttled. Please try again later.';
    case -140: // HTTPS_PROXY_TUNNEL_RESPONSE_REDIRECT
      return 'The HTTPS proxy tunnel unexpectedly redirected.';
    case -141: // SSL_CLIENT_AUTH_SIGNATURE_FAILED
      return 'Client certificate signature verification failed.';
    case -142: // MSG_TOO_BIG
      return 'The message was too large to send.';
    case -145: // WS_PROTOCOL_ERROR
      return 'WebSocket protocol error.';
    case -147: // ADDRESS_IN_USE
      return 'The network address is already in use.';
    case -148: // SSL_HANDSHAKE_NOT_COMPLETED
      return 'The SSL handshake was not completed.';
    case -149: // SSL_BAD_PEER_PUBLIC_KEY
      return 'The server provided an invalid public key.';
    case -150: // SSL_PINNED_KEY_NOT_IN_CERT_CHAIN
      return 'The expected pinned key was not found in the certificate chain.';
    case -151: // CLIENT_AUTH_CERT_TYPE_UNSUPPORTED
      return 'The client certificate type is not supported.';
    case -156: // SSL_DECRYPT_ERROR_ALERT
      return 'SSL decryption error.';
    case -157: // WS_THROTTLE_QUEUE_TOO_LARGE
      return 'Too many WebSocket connections pending.';
    case -158: // SSL_SERVER_CERT_CHANGED
      return 'The server certificate changed unexpectedly.';
    case -159: // SSL_UNRECOGNIZED_NAME_ALERT
      return 'The server does not recognize the requested hostname.';
    case -164: // SSL_SERVER_CERT_BAD_FORMAT
      return 'The server certificate has an invalid format.';
    case -165: // CT_STH_PARSING_FAILED
      return 'Certificate transparency parsing failed.';
    case -166: // CT_STH_INCOMPLETE
      return 'Certificate transparency data is incomplete.';
    case -167: // UNABLE_TO_REUSE_CONNECTION_FOR_PROXY_AUTH
      return 'Could not reuse connection for proxy authentication.';
    case -168: // CT_CONSISTENCY_PROOF_PARSING_FAILED
      return 'Certificate transparency consistency check failed.';
    case -169: // SSL_OBSOLETE_CIPHER
      return 'The connection uses an obsolete encryption cipher.';
    case -170: // WS_UPGRADE_FAILURE
      return 'WebSocket upgrade failed.';
    case -171: // READ_IF_READY_NOT_IMPLEMENTED
      return 'Read operation not implemented.';
    case -172: // NO_BUFFER_SPACE
      return 'No buffer space available.';
    case -173: // SSL_CLIENT_AUTH_NO_COMMON_ALGORITHMS
      return 'No common algorithms for client authentication.';
    case -174: // EARLY_DATA_REJECTED
      return 'Early data was rejected by the server.';
    case -175: // WRONG_VERSION_ON_EARLY_DATA
      return 'Wrong TLS version for early data.';
    case -176: // TLS13_DOWNGRADE_DETECTED
      return 'TLS 1.3 downgrade attack detected.';
    case -177: // SSL_KEY_USAGE_INCOMPATIBLE
      return 'The certificate key usage is incompatible.';
    case -178: // INVALID_ECH_CONFIG_LIST
      return 'Invalid ECH configuration.';
    case -179: // ECH_NOT_NEGOTIATED
      return 'ECH was not negotiated.';
    case -180: // ECH_FALLBACK_CERTIFICATE_INVALID
      return 'ECH fallback certificate is invalid.';
    default:
      return 'Could not establish a connection to the server. Please check your internet connection and try again.';
  }
}

/**
 * Get user-friendly message for DNS errors
 */
function getDnsErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case -800: // DNS_MALFORMED_RESPONSE
      return 'Received a malformed response from the DNS server.';
    case -801: // DNS_SERVER_REQUIRES_TCP
      return 'The DNS server requires a TCP connection.';
    case -802: // DNS_SERVER_FAILED
      return 'The DNS server failed to respond.';
    case -803: // DNS_TIMED_OUT
      return 'The DNS lookup timed out.';
    case -804: // DNS_CACHE_MISS
      return 'DNS cache miss.';
    case -805: // DNS_SEARCH_EMPTY
      return 'DNS search returned no results.';
    case -806: // DNS_SORT_ERROR
      return 'Error sorting DNS results.';
    case -807: // DNS_SECURE_RESOLVER_HOSTNAME_RESOLUTION_FAILED
      return 'Secure DNS resolver failed to resolve hostname.';
    case -808: // DNS_NAME_HTTPS_ONLY
      return 'This site requires HTTPS.';
    case -809: // DNS_REQUEST_CANCELLED
      return 'The DNS request was cancelled.';
    case -810: // DNS_NO_MATCHING_SUPPORTED_ALPN
      return 'No matching ALPN protocol found.';
    default:
      return "Could not find the server for this website. Check that the address is correct and you're connected to the internet.";
  }
}

/**
 * Get user-friendly message for protocol/URL errors
 */
function getProtocolErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case -300: // INVALID_URL
      return 'The URL is not valid.';
    case -301: // DISALLOWED_URL_SCHEME
      return 'The URL scheme is not allowed.';
    case -302: // UNKNOWN_URL_SCHEME
      return 'The URL scheme is not recognized.';
    case -303: // INVALID_REDIRECT
      return 'The page redirected in an invalid way.';
    case -310: // TOO_MANY_REDIRECTS
      return 'Too many redirects. The page may be misconfigured.';
    case -311: // UNSAFE_REDIRECT
      return 'The page attempted an unsafe redirect.';
    case -312: // UNSAFE_PORT
      return 'The requested port is not allowed for security reasons.';
    case -320: // INVALID_RESPONSE
      return 'The server sent an invalid response.';
    case -321: // INVALID_CHUNKED_ENCODING
      return 'The server response has invalid encoding.';
    case -322: // METHOD_NOT_SUPPORTED
      return 'The request method is not supported.';
    case -323: // UNEXPECTED_PROXY_AUTH
      return 'Unexpected proxy authentication required.';
    case -324: // EMPTY_RESPONSE
      return 'The server sent an empty response.';
    case -325: // RESPONSE_HEADERS_TOO_BIG
      return 'The response headers are too large.';
    case -350: // CONTENT_LENGTH_MISMATCH
      return 'The content length does not match.';
    case -351: // INCOMPLETE_CHUNKED_ENCODING
      return 'The response was incomplete.';
    case -352: // QUIC_PROTOCOL_ERROR
      return 'QUIC protocol error.';
    case -353: // RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH
      return 'Multiple content length headers in response.';
    case -354: // RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION
      return 'Multiple content disposition headers in response.';
    case -355: // RESPONSE_HEADERS_MULTIPLE_LOCATION
      return 'Multiple location headers in response.';
    case -400: // CACHE_MISS
      return 'The requested content is not in the cache.';
    default:
      return 'The page could not be loaded due to a protocol error.';
  }
}

/**
 * Get user-friendly message for generic/other errors
 */
function getGenericErrorMessage(errorCode: number): string {
  const errorName = ChromiumErrorNames[errorCode];
  if (errorName) {
    return `An error occurred while loading the page (${errorName}).`;
  }
  return 'An unexpected error occurred while loading the page.';
}

/**
 * Get the Chromium error name for an error code
 */
export function getErrorName(errorCode: number): string {
  return (
    ChromiumErrorNames[errorCode] || `UNKNOWN_ERROR_${Math.abs(errorCode)}`
  );
}
