export const ChromiumErrorNames: Record<number, string> = {
  [-1]: 'IO_PENDING',

  // A generic failure occurred.
  [-2]: 'FAILED',

  // An operation was aborted (due to user action).
  [-3]: 'ABORTED',

  // An argument to the function is incorrect.
  [-4]: 'INVALID_ARGUMENT',

  // The handle or file descriptor is invalid.
  [-5]: 'INVALID_HANDLE',

  // The file or directory cannot be found.
  [-6]: 'FILE_NOT_FOUND',

  // An operation timed out.
  [-7]: 'TIMED_OUT',

  // The file is too large.
  [-8]: 'FILE_TOO_BIG',

  // An unexpected error.  This may be caused by a programming mistake or an
  // invalid assumption.
  [-9]: 'UNEXPECTED',

  // Permission to access a resource, other than the network, was denied.
  [-10]: 'ACCESS_DENIED',

  // The operation failed because of unimplemented functionality.
  [-11]: 'NOT_IMPLEMENTED',

  // There were not enough resources to complete the operation.
  [-12]: 'INSUFFICIENT_RESOURCES',

  // Memory allocation failed.
  [-13]: 'OUT_OF_MEMORY',

  // The file upload failed because the file's modification time was different
  // from the expectation.
  [-14]: 'UPLOAD_FILE_CHANGED',

  // The socket is not connected.
  [-15]: 'SOCKET_NOT_CONNECTED',

  // The file already exists.
  [-16]: 'FILE_EXISTS',

  // The path or file name is too long.
  [-17]: 'FILE_PATH_TOO_LONG',

  // Not enough room left on the disk.
  [-18]: 'FILE_NO_SPACE',

  // The file has a virus.
  [-19]: 'FILE_VIRUS_INFECTED',

  // The client chose to block the request.
  [-20]: 'BLOCKED_BY_CLIENT',

  // The network changed.
  [-21]: 'NETWORK_CHANGED',

  // The request was blocked by the URL block list configured by the domain
  // administrator.
  [-22]: 'BLOCKED_BY_ADMINISTRATOR',

  // The socket is already connected.
  [-23]: 'SOCKET_IS_CONNECTED',

  // Error -24 was removed (BLOCKED_ENROLLMENT_CHECK_PENDING)

  // The upload failed because the upload stream needed to be re-read, due to a
  // retry or a redirect, but the upload stream doesn't support that operation.
  [-25]: 'UPLOAD_STREAM_REWIND_NOT_SUPPORTED',

  // The request failed because the URLRequestContext is shutting down, or has
  // been shut down.
  [-26]: 'CONTEXT_SHUT_DOWN',

  // The request failed because the response was delivered along with requirements
  // which are not met ('X-Frame-Options' and 'Content-Security-Policy' ancestor
  // checks and 'Cross-Origin-Resource-Policy' for instance).
  [-27]: 'BLOCKED_BY_RESPONSE',

  // Error -28 was removed (BLOCKED_BY_XSS_AUDITOR).

  // The request was blocked by system policy disallowing some or all cleartext
  // requests. Used for NetworkSecurityPolicy on Android.
  [-29]: 'CLEARTEXT_NOT_PERMITTED',

  // The request was blocked by a Content Security Policy
  [-30]: 'BLOCKED_BY_CSP',

  // [-31]: 'H2_OR_QUIC_REQUIRED', was removed. It was:
  // The request was blocked because of no H/2 or QUIC session.

  // The request was blocked by CORB or ORB.
  [-32]: 'BLOCKED_BY_ORB',

  // The request was blocked because it originated from a frame that has disabled
  // network access.
  [-33]: 'NETWORK_ACCESS_REVOKED',

  // The request was blocked by fingerprinting protections.
  [-34]: 'BLOCKED_BY_FINGERPRINTING_PROTECTION',

  // The request was blocked by the Incognito Mode URL block list configured by
  // the domain administrator.
  [-35]: 'BLOCKED_IN_INCOGNITO_BY_ADMINISTRATOR',

  // A connection was closed (corresponding to a TCP FIN).
  [-100]: 'CONNECTION_CLOSED',

  // A connection was reset (corresponding to a TCP RST).
  [-101]: 'CONNECTION_RESET',

  // A connection attempt was refused.
  [-102]: 'CONNECTION_REFUSED',

  // A connection timed out as a result of not receiving an ACK for data sent.
  // This can include a FIN packet that did not get ACK'd.
  [-103]: 'CONNECTION_ABORTED',

  // A connection attempt failed.
  [-104]: 'CONNECTION_FAILED',

  // The host name could not be resolved.
  [-105]: 'NAME_NOT_RESOLVED',

  // The Internet connection has been lost.
  [-106]: 'INTERNET_DISCONNECTED',

  // An SSL protocol error occurred.
  [-107]: 'SSL_PROTOCOL_ERROR',

  // The IP address or port number is invalid (e.g., cannot connect to the IP
  // address 0 or the port 0).
  [-108]: 'ADDRESS_INVALID',

  // The IP address is unreachable.  This usually means that there is no route to
  // the specified host or network.
  [-109]: 'ADDRESS_UNREACHABLE',

  // The server requested a client certificate for SSL client authentication.
  [-110]: 'SSL_CLIENT_AUTH_CERT_NEEDED',

  // A tunnel connection through the proxy could not be established. For more info
  // see the comment on PROXY_UNABLE_TO_CONNECT_TO_DESTINATION.
  [-111]: 'TUNNEL_CONNECTION_FAILED',

  // Obsolete:
  // [-112]: 'NO_SSL_VERSIONS_ENABLED',

  // The client and server don't support a common SSL protocol version or
  // cipher suite.
  [-113]: 'SSL_VERSION_OR_CIPHER_MISMATCH',

  // The server requested a renegotiation (rehandshake).
  [-114]: 'SSL_RENEGOTIATION_REQUESTED',

  // The proxy requested authentication (for tunnel establishment) with an
  // unsupported method.
  [-115]: 'PROXY_AUTH_UNSUPPORTED',

  // Error -116 was removed (CERT_ERROR_IN_SSL_RENEGOTIATION)

  // The SSL handshake failed because of a bad or missing client certificate.
  [-117]: 'BAD_SSL_CLIENT_AUTH_CERT',

  // A connection attempt timed out.
  [-118]: 'CONNECTION_TIMED_OUT',

  // There are too many pending DNS resolves, so a request in the queue was
  // aborted.
  [-119]: 'HOST_RESOLVER_QUEUE_TOO_LARGE',

  // Failed establishing a connection to the SOCKS proxy server for a target host.
  [-120]: 'SOCKS_CONNECTION_FAILED',

  // The SOCKS proxy server failed establishing connection to the target host
  // because that host is unreachable.
  [-121]: 'SOCKS_CONNECTION_HOST_UNREACHABLE',

  // The request to negotiate an alternate protocol failed.
  [-122]: 'ALPN_NEGOTIATION_FAILED',

  // The peer sent an SSL no_renegotiation alert message.
  [-123]: 'SSL_NO_RENEGOTIATION',

  // Winsock sometimes reports more data written than passed.  This is probably
  // due to a broken LSP.
  [-124]: 'WINSOCK_UNEXPECTED_WRITTEN_BYTES',

  // An SSL peer sent us a fatal decompression_failure alert. This typically
  // occurs when a peer selects DEFLATE compression in the mistaken belief that
  // it supports it.
  [-125]: 'SSL_DECOMPRESSION_FAILURE_ALERT',

  // An SSL peer sent us a fatal bad_record_mac alert. This has been observed
  // from servers with buggy DEFLATE support.
  [-126]: 'SSL_BAD_RECORD_MAC_ALERT',

  // The proxy requested authentication (for tunnel establishment).
  [-127]: 'PROXY_AUTH_REQUESTED',

  // Error -129 was removed (SSL_WEAK_SERVER_EPHEMERAL_DH_KEY).

  // Could not create a connection to the proxy server. An error occurred
  // either in resolving its name, or in connecting a socket to it.
  // Note that this does NOT include failures during the actual "CONNECT" method
  // of an HTTP proxy.
  [-130]: 'PROXY_CONNECTION_FAILED',

  // A mandatory proxy configuration could not be used. Currently this means
  // that a mandatory PAC script could not be fetched, parsed or executed.
  [-131]: 'MANDATORY_PROXY_CONFIGURATION_FAILED',

  // -132 was formerly ERR_ESET_ANTI_VIRUS_SSL_INTERCEPTION

  // We've hit the max socket limit for the socket pool while preconnecting.  We
  // don't bother trying to preconnect more sockets.
  [-133]: 'PRECONNECT_MAX_SOCKET_LIMIT',

  // The permission to use the SSL client certificate's private key was denied.
  [-134]: 'SSL_CLIENT_AUTH_PRIVATE_KEY_ACCESS_DENIED',

  // The SSL client certificate has no private key.
  [-135]: 'SSL_CLIENT_AUTH_CERT_NO_PRIVATE_KEY',

  // The certificate presented by the HTTPS Proxy was invalid.
  [-136]: 'PROXY_CERTIFICATE_INVALID',

  // An error occurred when trying to do a name resolution (DNS).
  [-137]: 'NAME_RESOLUTION_FAILED',

  // Permission to access the network was denied. This is used to distinguish
  // errors that were most likely caused by a firewall from other access denied
  // errors. See also ERR_ACCESS_DENIED.
  [-138]: 'NETWORK_ACCESS_DENIED',

  // The request throttler module cancelled this request to avoid DDOS.
  [-139]: 'TEMPORARILY_THROTTLED',

  // Obsolete, since we now use the catch-all ERR_TUNNEL_CONNECTION_FAILED when a
  // proxy tried to redirect a request.
  // [-140]: 'HTTPS_PROXY_TUNNEL_RESPONSE_REDIRECT',

  // We were unable to sign the CertificateVerify data of an SSL client auth
  // handshake with the client certificate's private key.
  //
  // Possible causes for this include the user implicitly or explicitly
  // denying access to the private key, the private key may not be valid for
  // signing, the key may be relying on a cached handle which is no longer
  // valid, or the CSP won't allow arbitrary data to be signed.
  [-141]: 'SSL_CLIENT_AUTH_SIGNATURE_FAILED',

  // The message was too large for the transport.  (for example a UDP message
  // which exceeds size threshold).
  [-142]: 'MSG_TOO_BIG',

  // Error -143 was removed (SPDY_SESSION_ALREADY_EXISTS)

  // Error -144 was removed (LIMIT_VIOLATION).

  // Websocket protocol error. Indicates that we are terminating the connection
  // due to a malformed frame or other protocol violation.
  [-145]: 'WS_PROTOCOL_ERROR',

  // Error -146 was removed (PROTOCOL_SWITCHED)

  // Returned when attempting to bind an address that is already in use.
  [-147]: 'ADDRESS_IN_USE',

  // Obsolete:
  // [-148]: 'SSL_HANDSHAKE_NOT_COMPLETED',
  // [-149]: 'SSL_BAD_PEER_PUBLIC_KEY',

  // The certificate didn't match the built-in public key pins for the host name.
  // The pins are set in net/http/transport_security_state.cc and require that
  // one of a set of public keys exist on the path from the leaf to the root.
  [-150]: 'SSL_PINNED_KEY_NOT_IN_CERT_CHAIN',

  // Server request for client certificate did not contain any types we support.
  [-151]: 'CLIENT_AUTH_CERT_TYPE_UNSUPPORTED',

  // Error -152 was removed (ORIGIN_BOUND_CERT_GENERATION_TYPE_MISMATCH)

  // An SSL peer sent us a fatal decrypt_error alert. This typically occurs when
  // a peer could not correctly verify a signature (in CertificateVerify or
  // ServerKeyExchange) or validate a Finished message.
  [-153]: 'SSL_DECRYPT_ERROR_ALERT',

  // There are too many pending WebSocketJob instances, so the new job was not
  // pushed to the queue.
  [-154]: 'WS_THROTTLE_QUEUE_TOO_LARGE',

  // Error -155 was removed (TOO_MANY_SOCKET_STREAMS)

  // The SSL server certificate changed in a renegotiation.
  [-156]: 'SSL_SERVER_CERT_CHANGED',

  // Error -157 was removed (SSL_INAPPROPRIATE_FALLBACK).

  // Error -158 was removed (CT_NO_SCTS_VERIFIED_OK).

  // The SSL server sent us a fatal unrecognized_name alert.
  [-159]: 'SSL_UNRECOGNIZED_NAME_ALERT',

  // Failed to set the socket's receive buffer size as requested.
  [-160]: 'SOCKET_SET_RECEIVE_BUFFER_SIZE_ERROR',

  // Failed to set the socket's send buffer size as requested.
  [-161]: 'SOCKET_SET_SEND_BUFFER_SIZE_ERROR',

  // Failed to set the socket's receive buffer size as requested, despite success
  // return code from setsockopt.
  [-162]: 'SOCKET_RECEIVE_BUFFER_SIZE_UNCHANGEABLE',

  // Failed to set the socket's send buffer size as requested, despite success
  // return code from setsockopt.
  [-163]: 'SOCKET_SEND_BUFFER_SIZE_UNCHANGEABLE',

  // Failed to import a client certificate from the platform store into the SSL
  // library.
  [-164]: 'SSL_CLIENT_AUTH_CERT_BAD_FORMAT',

  // Error -165 was removed (SSL_FALLBACK_BEYOND_MINIMUM_VERSION).

  // Resolving a hostname to an IP address list included the IPv4 address
  // "127.0.53.53". This is a special IP address which ICANN has recommended to
  // indicate there was a name collision, and alert admins to a potential
  // problem.
  [-166]: 'ICANN_NAME_COLLISION',

  // The SSL server presented a certificate which could not be decoded. This is
  // not a certificate error code as no X509Certificate object is available. This
  // error is fatal.
  [-167]: 'SSL_SERVER_CERT_BAD_FORMAT',

  // Certificate Transparency: Received a signed tree head that failed to parse.
  [-168]: 'CT_STH_PARSING_FAILED',

  // Certificate Transparency: Received a signed tree head whose JSON parsing was
  // OK but was missing some of the fields.
  [-169]: 'CT_STH_INCOMPLETE',

  // The attempt to reuse a connection to send proxy auth credentials failed
  // before the AuthController was used to generate credentials. The caller should
  // reuse the controller with a new connection. This error is only used
  // internally by the network stack.
  [-170]: 'UNABLE_TO_REUSE_CONNECTION_FOR_PROXY_AUTH',

  // Certificate Transparency: Failed to parse the received consistency proof.
  [-171]: 'CT_CONSISTENCY_PROOF_PARSING_FAILED',

  // The SSL server required an unsupported cipher suite that has since been
  // removed. This error will temporarily be signaled on a fallback for one or two
  // releases immediately following a cipher suite's removal, after which the
  // fallback will be removed.
  [-172]: 'SSL_OBSOLETE_CIPHER',

  // When a WebSocket handshake is done successfully and the connection has been
  // upgraded, the URLRequest is cancelled with this error code.
  [-173]: 'WS_UPGRADE',

  // Socket ReadIfReady support is not implemented. This error should not be user
  // visible, because the normal Read() method is used as a fallback.
  [-174]: 'READ_IF_READY_NOT_IMPLEMENTED',

  // Error -175 was removed (SSL_VERSION_INTERFERENCE).

  // No socket buffer space is available.
  [-176]: 'NO_BUFFER_SPACE',

  // There were no common signature algorithms between our client certificate
  // private key and the server's preferences.
  [-177]: 'SSL_CLIENT_AUTH_NO_COMMON_ALGORITHMS',

  // TLS 1.3 early data was rejected by the server. This will be received before
  // any data is returned from the socket. The request should be retried with
  // early data disabled.
  [-178]: 'EARLY_DATA_REJECTED',

  // TLS 1.3 early data was offered, but the server responded with TLS 1.2 or
  // earlier. This is an internal error code to account for a
  // backwards-compatibility issue with early data and TLS 1.2. It will be
  // received before any data is returned from the socket. The request should be
  // retried with early data disabled.
  //
  // See https://tools.ietf.org/html/rfc8446#appendix-D.3 for details.
  [-179]: 'WRONG_VERSION_ON_EARLY_DATA',

  // TLS 1.3 was enabled, but a lower version was negotiated and the server
  // returned a value indicating it supported TLS 1.3. This is part of a security
  // check in TLS 1.3, but it may also indicate the user is behind a buggy
  // TLS-terminating proxy which implemented TLS 1.2 incorrectly. (See
  // https://crbug.com/boringssl/226.)
  [-180]: 'TLS13_DOWNGRADE_DETECTED',

  // The server's certificate has a keyUsage extension incompatible with the
  // negotiated TLS key exchange method.
  [-181]: 'SSL_KEY_USAGE_INCOMPATIBLE',

  // The ECHConfigList fetched over DNS cannot be parsed.
  [-182]: 'INVALID_ECH_CONFIG_LIST',

  // ECH was enabled, but the server was unable to decrypt the encrypted
  // ClientHello.
  [-183]: 'ECH_NOT_NEGOTIATED',

  // ECH was enabled, the server was unable to decrypt the encrypted ClientHello,
  // and additionally did not present a certificate valid for the public name.
  [-184]: 'ECH_FALLBACK_CERTIFICATE_INVALID',

  // Error -185 was removed (PROXY_TUNNEL_REQUEST_FAILED).

  // An attempt to proxy a request failed because the proxy wasn't able to
  // successfully connect to the destination. This likely indicates an issue with
  // the request itself (for instance, the hostname failed to resolve to an IP
  // address or the destination server refused the connection). This error code
  // is used to indicate that the error is outside the control of the proxy server
  // and thus the proxy chain should not be marked as bad. This is in contrast to
  // ERR_TUNNEL_CONNECTION_FAILED which is used for general purpose errors
  // connecting to the proxy and by the proxy request response handling when a
  // proxy delegate doesn't indicate via a different error code whether proxy
  // fallback should occur. Note that for IP Protection proxies this error code
  // causes the proxy to be marked as bad since the preference is to fail open for
  // general purpose errors, but for other proxies this error does not cause the
  // proxy to be marked as bad.
  [-186]: 'PROXY_UNABLE_TO_CONNECT_TO_DESTINATION',

  // Some implementations of ProxyDelegate query a separate entity to know whether
  // it should cancel tunnel prior to:
  // - The HTTP CONNECT requests being sent out
  // - The HTTP CONNECT response being parsed by //net
  // An example is CronetProxyDelegate: Cronet allows developers to decide whether
  // the tunnel being established should be canceled.
  [-187]: 'PROXY_DELEGATE_CANCELED_CONNECT_REQUEST',
  [-188]: 'PROXY_DELEGATE_CANCELED_CONNECT_RESPONSE',

  // Certificate error codes
  //
  // The values of certificate error codes must be consecutive.

  // The server responded with a certificate whose common name did not match
  // the host name.  This could mean:
  //
  // 1. An attacker has redirected our traffic to their server and is
  //    presenting a certificate for which they know the private key.
  //
  // 2. The server is misconfigured and responding with the wrong cert.
  //
  // 3. The user is on a wireless network and is being redirected to the
  //    network's login page.
  //
  // 4. The OS has used a DNS search suffix and the server doesn't have
  //    a certificate for the abbreviated name in the address bar.
  //
  [-200]: 'CERT_COMMON_NAME_INVALID',

  // The server responded with a certificate that, by our clock, appears to
  // either not yet be valid or to have expired.  This could mean:
  //
  // 1. An attacker is presenting an old certificate for which they have
  //    managed to obtain the private key.
  //
  // 2. The server is misconfigured and is not presenting a valid cert.
  //
  // 3. Our clock is wrong.
  //
  [-201]: 'CERT_DATE_INVALID',

  // The server responded with a certificate that is signed by an authority
  // we don't trust.  The could mean:
  //
  // 1. An attacker has substituted the real certificate for a cert that
  //    contains their public key and is signed by their cousin.
  //
  // 2. The server operator has a legitimate certificate from a CA we don't
  //    know about, but should trust.
  //
  // 3. The server is presenting a self-signed certificate, providing no
  //    defense against active attackers (but foiling passive attackers).
  //
  [-202]: 'CERT_AUTHORITY_INVALID',

  // The server responded with a certificate that contains errors.
  // This error is not recoverable.
  //
  // MSDN describes this error as follows:
  //   "The SSL certificate contains errors."
  // NOTE: It's unclear how this differs from ERR_CERT_INVALID. For consistency,
  // use that code instead of this one from now on.
  //
  [-203]: 'CERT_CONTAINS_ERRORS',

  // The certificate has no mechanism for determining if it is revoked.  In
  // effect, this certificate cannot be revoked.
  [-204]: 'CERT_NO_REVOCATION_MECHANISM',

  // Revocation information for the security certificate for this site is not
  // available.  This could mean:
  //
  // 1. An attacker has compromised the private key in the certificate and is
  //    blocking our attempt to find out that the cert was revoked.
  //
  // 2. The certificate is unrevoked, but the revocation server is busy or
  //    unavailable.
  //
  [-205]: 'CERT_UNABLE_TO_CHECK_REVOCATION',

  // The server responded with a certificate has been revoked.
  // We have the capability to ignore this error, but it is probably not the
  // thing to do.
  [-206]: 'CERT_REVOKED',

  // The server responded with a certificate that is invalid.
  // This error is not recoverable.
  //
  // MSDN describes this error as follows:
  //   "The SSL certificate is invalid."
  //
  [-207]: 'CERT_INVALID',

  // The server responded with a certificate that is signed using a weak
  // signature algorithm.
  [-208]: 'CERT_WEAK_SIGNATURE_ALGORITHM',

  // -209 is available: was CERT_NOT_IN_DNS.

  // The host name specified in the certificate is not unique.
  [-210]: 'CERT_NON_UNIQUE_NAME',

  // The server responded with a certificate that contains a weak key (e.g.
  // a too-small RSA key).
  [-211]: 'CERT_WEAK_KEY',

  // The certificate claimed DNS names that are in violation of name constraints.
  [-212]: 'CERT_NAME_CONSTRAINT_VIOLATION',

  // The certificate's validity period is too long.
  [-213]: 'CERT_VALIDITY_TOO_LONG',

  // Certificate Transparency was required for this connection, but the server
  // did not provide CT information that complied with the policy.
  [-214]: 'CERTIFICATE_TRANSPARENCY_REQUIRED',

  // Error -215 was removed (CERT_SYMANTEC_LEGACY)

  // -216 was QUIC_CERT_ROOT_NOT_KNOWN which has been renumbered to not be in the
  // certificate error range.

  // The certificate is known to be used for interception by an entity other
  // the device owner.
  [-217]: 'CERT_KNOWN_INTERCEPTION_BLOCKED',

  // -218 was SSL_OBSOLETE_VERSION which is not longer used. TLS 1.0/1.1 instead
  // cause SSL_VERSION_OR_CIPHER_MISMATCH now.

  // The certificate is self signed and it's being used for either an RFC1918 IP
  // literal URL, or a url ending in .local.
  [-219]: 'CERT_SELF_SIGNED_LOCAL_NETWORK',

  // Add new certificate error codes here.
  //
  // Update the value of CERT_END whenever you add a new certificate error
  // code.

  // The value immediately past the last certificate error code.
  [-220]: 'CERT_END',

  // The URL is invalid.
  [-300]: 'INVALID_URL',

  // The scheme of the URL is disallowed.
  [-301]: 'DISALLOWED_URL_SCHEME',

  // The scheme of the URL is unknown.
  [-302]: 'UNKNOWN_URL_SCHEME',

  // Attempting to load an URL resulted in a redirect to an invalid URL.
  [-303]: 'INVALID_REDIRECT',

  // Attempting to load an URL resulted in too many redirects.
  [-310]: 'TOO_MANY_REDIRECTS',

  // Attempting to load an URL resulted in an unsafe redirect (e.g., a redirect
  // to file:// is considered unsafe).
  [-311]: 'UNSAFE_REDIRECT',

  // Attempting to load an URL with an unsafe port number.  These are port
  // numbers that correspond to services, which are not robust to spurious input
  // that may be constructed as a result of an allowed web construct (e.g., HTTP
  // looks a lot like SMTP, so form submission to port 25 is denied).
  [-312]: 'UNSAFE_PORT',

  // The server's response was invalid.
  [-320]: 'INVALID_RESPONSE',

  // Error in chunked transfer encoding.
  [-321]: 'INVALID_CHUNKED_ENCODING',

  // The server did not support the request method.
  [-322]: 'METHOD_NOT_SUPPORTED',

  // The response was 407 (Proxy Authentication Required), yet we did not send
  // the request to a proxy.
  [-323]: 'UNEXPECTED_PROXY_AUTH',

  // The server closed the connection without sending any data.
  [-324]: 'EMPTY_RESPONSE',

  // The headers section of the response is too large.
  [-325]: 'RESPONSE_HEADERS_TOO_BIG',

  // Error -326 was removed (PAC_STATUS_NOT_OK)

  // The evaluation of the PAC script failed.
  [-327]: 'PAC_SCRIPT_FAILED',

  // The response was 416 (Requested range not satisfiable) and the server cannot
  // satisfy the range requested.
  [-328]: 'REQUEST_RANGE_NOT_SATISFIABLE',

  // The identity used for authentication is invalid.
  [-329]: 'MALFORMED_IDENTITY',

  // Content decoding of the response body failed.
  [-330]: 'CONTENT_DECODING_FAILED',

  // An operation could not be completed because all network IO
  // is suspended.
  [-331]: 'NETWORK_IO_SUSPENDED',

  // Obsolete. This was in earlier SPDY implementations.
  // [-332]: 'SYN_REPLY_NOT_RECEIVED',

  // Obsolete. These were both used for FTP, which is no longer supported.
  // [-333]: 'ENCODING_CONVERSION_FAILED',
  // [-334]: 'UNRECOGNIZED_FTP_DIRECTORY_LISTING_FORMAT',

  // Obsolete. Was only logged in NetLog when an HTTP/2 pushed stream expired.
  // [-335]: 'INVALID_SPDY_STREAM',

  // There are no supported proxies in the provided list.
  [-336]: 'NO_SUPPORTED_PROXIES',

  // There is an HTTP/2 protocol error.
  [-337]: 'HTTP2_PROTOCOL_ERROR',

  // Credentials could not be established during HTTP Authentication.
  [-338]: 'INVALID_AUTH_CREDENTIALS',

  // An HTTP Authentication scheme was tried which is not supported on this
  // machine.
  [-339]: 'UNSUPPORTED_AUTH_SCHEME',

  // Detecting the encoding of the response failed.
  [-340]: 'ENCODING_DETECTION_FAILED',

  // (GSSAPI) No Kerberos credentials were available during HTTP Authentication.
  [-341]: 'MISSING_AUTH_CREDENTIALS',

  // An unexpected, but documented, SSPI or GSSAPI status code was returned.
  [-342]: 'UNEXPECTED_SECURITY_LIBRARY_STATUS',

  // The environment was not set up correctly for authentication (for
  // example, no KDC could be found or the principal is unknown.
  [-343]: 'MISCONFIGURED_AUTH_ENVIRONMENT',

  // An undocumented SSPI or GSSAPI status code was returned.
  [-344]: 'UNDOCUMENTED_SECURITY_LIBRARY_STATUS',

  // The HTTP response was too big to drain.
  [-345]: 'RESPONSE_BODY_TOO_BIG_TO_DRAIN',

  // The HTTP response contained multiple distinct Content-Length headers.
  [-346]: 'RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH',

  // HTTP/2 headers have been received, but not all of them - status or version
  // headers are missing, so we're expecting additional frames to complete them.
  [-347]: 'INCOMPLETE_HTTP2_HEADERS',

  // No PAC URL configuration could be retrieved from DHCP. This can indicate
  // either a failure to retrieve the DHCP configuration, or that there was no
  // PAC URL configured in DHCP.
  [-348]: 'PAC_NOT_IN_DHCP',

  // The HTTP response contained multiple Content-Disposition headers.
  [-349]: 'RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION',

  // The HTTP response contained multiple Location headers.
  [-350]: 'RESPONSE_HEADERS_MULTIPLE_LOCATION',

  // HTTP/2 server refused the request without processing, and sent either a
  // GOAWAY frame with error code NO_ERROR and Last-Stream-ID lower than the
  // stream id corresponding to the request indicating that this request has not
  // been processed yet, or a RST_STREAM frame with error code REFUSED_STREAM.
  // Client MAY retry (on a different connection).  See RFC7540 Section 8.1.4.
  [-351]: 'HTTP2_SERVER_REFUSED_STREAM',

  // HTTP/2 server didn't respond to the PING message.
  [-352]: 'HTTP2_PING_FAILED',

  // Obsolete.  Kept here to avoid reuse, as the old error can still appear on
  // histograms.
  // [-353]: 'PIPELINE_EVICTION',

  // The HTTP response body transferred fewer bytes than were advertised by the
  // Content-Length header when the connection is closed.
  [-354]: 'CONTENT_LENGTH_MISMATCH',

  // The HTTP response body is transferred with Chunked-Encoding, but the
  // terminating zero-length chunk was never sent when the connection is closed.
  [-355]: 'INCOMPLETE_CHUNKED_ENCODING',

  // There is a QUIC protocol error.
  [-356]: 'QUIC_PROTOCOL_ERROR',

  // The HTTP headers were truncated by an EOF.
  [-357]: 'RESPONSE_HEADERS_TRUNCATED',

  // The QUIC crypto handshake failed.  This means that the server was unable
  // to read any requests sent, so they may be resent.
  [-358]: 'QUIC_HANDSHAKE_FAILED',

  // Obsolete.  Kept here to avoid reuse, as the old error can still appear on
  // histograms.
  // [-359]: 'REQUEST_FOR_SECURE_RESOURCE_OVER_INSECURE_QUIC',

  // Transport security is inadequate for the HTTP/2 version.
  [-360]: 'HTTP2_INADEQUATE_TRANSPORT_SECURITY',

  // The peer violated HTTP/2 flow control.
  [-361]: 'HTTP2_FLOW_CONTROL_ERROR',

  // The peer sent an improperly sized HTTP/2 frame.
  [-362]: 'HTTP2_FRAME_SIZE_ERROR',

  // Decoding or encoding of compressed HTTP/2 headers failed.
  [-363]: 'HTTP2_COMPRESSION_ERROR',

  // Proxy Auth Requested without a valid Client Socket Handle.
  [-364]: 'PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION',

  // HTTP_1_1_REQUIRED error code received on HTTP/2 session.
  [-365]: 'HTTP_1_1_REQUIRED',

  // HTTP_1_1_REQUIRED error code received on HTTP/2 session to proxy.
  [-366]: 'PROXY_HTTP_1_1_REQUIRED',

  // The PAC script terminated fatally and must be reloaded.
  [-367]: 'PAC_SCRIPT_TERMINATED',

  // Signals that the request requires the IPP proxy.
  [-368]: 'PROXY_REQUIRED',

  // Obsolete. Kept here to avoid reuse.
  // Request is throttled because of a Backoff header.
  // See: crbug.com/486891.
  // [-369]: 'TEMPORARY_BACKOFF',

  // The server was expected to return an HTTP/1.x response, but did not. Rather
  // than treat it as HTTP/0.9, this error is returned.
  [-370]: 'INVALID_HTTP_RESPONSE',

  // Initializing content decoding failed.
  [-371]: 'CONTENT_DECODING_INIT_FAILED',

  // Received HTTP/2 RST_STREAM frame with NO_ERROR error code.  This error should
  // be handled internally by HTTP/2 code, and should not make it above the
  // SpdyStream layer.
  [-372]: 'HTTP2_RST_STREAM_NO_ERROR_RECEIVED',

  // Obsolete. HTTP/2 push is removed.
  // [-373]: 'HTTP2_PUSHED_STREAM_NOT_AVAILABLE',

  // Obsolete. HTTP/2 push is removed.
  // [-374]: 'HTTP2_CLAIMED_PUSHED_STREAM_RESET_BY_SERVER',

  // An HTTP transaction was retried too many times due for authentication or
  // invalid certificates. This may be due to a bug in the net stack that would
  // otherwise infinite loop, or if the server or proxy continually requests fresh
  // credentials or presents a fresh invalid certificate.
  [-375]: 'TOO_MANY_RETRIES',

  // Received an HTTP/2 frame on a closed stream.
  [-376]: 'HTTP2_STREAM_CLOSED',

  // Obsolete. HTTP/2 push is removed.
  // [-377]: 'HTTP2_CLIENT_REFUSED_STREAM',

  // Obsolete. HTTP/2 push is removed.
  // [-378]: 'HTTP2_PUSHED_RESPONSE_DOES_NOT_MATCH',

  // The server returned a non-2xx HTTP response code.
  //
  // Note that this error is only used by certain APIs that interpret the HTTP
  // response itself. URLRequest for instance just passes most non-2xx
  // response back as success.
  [-379]: 'HTTP_RESPONSE_CODE_FAILURE',

  // The certificate presented on a QUIC connection does not chain to a known root
  // and the origin connected to is not on a list of domains where unknown roots
  // are allowed.
  [-380]: 'QUIC_CERT_ROOT_NOT_KNOWN',

  // A GOAWAY frame has been received indicating that the request has not been
  // processed and is therefore safe to retry on a different connection.
  [-381]: 'QUIC_GOAWAY_REQUEST_CAN_BE_RETRIED',

  // The ACCEPT_CH restart has been triggered too many times
  [-382]: 'TOO_MANY_ACCEPT_CH_RESTARTS',

  // The IP address space of the remote endpoint differed from the previous
  // observed value during the same request. Any cache entry for the affected
  // request should be invalidated.
  [-383]: 'INCONSISTENT_IP_ADDRESS_SPACE',

  // The IP address space of the cached remote endpoint is blocked by private
  // network access check.
  [-384]: 'CACHED_IP_ADDRESS_SPACE_BLOCKED_BY_LOCAL_NETWORK_ACCESS_POLICY',

  // The connection is blocked by private network access checks.
  [-385]: 'BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS',

  // Content decoding failed due to the zstd window size being too big (over 8MB).
  [-386]: 'ZSTD_WINDOW_SIZE_TOO_BIG',

  // The compression dictionary cannot be loaded.
  [-387]: 'DICTIONARY_LOAD_FAILED',

  // The header of dictionary compressed stream does not match the expected value.
  [-388]: 'UNEXPECTED_CONTENT_DICTIONARY_HEADER',

  // The cache does not have the requested entry.
  [-400]: 'CACHE_MISS',

  // Unable to read from the disk cache.
  [-401]: 'CACHE_READ_FAILURE',

  // Unable to write to the disk cache.
  [-402]: 'CACHE_WRITE_FAILURE',

  // The operation is not supported for this entry.
  [-403]: 'CACHE_OPERATION_NOT_SUPPORTED',

  // The disk cache is unable to open this entry.
  [-404]: 'CACHE_OPEN_FAILURE',

  // The disk cache is unable to create this entry.
  [-405]: 'CACHE_CREATE_FAILURE',

  // Multiple transactions are racing to create disk cache entries. This is an
  // internal error returned from the HttpCache to the HttpCacheTransaction that
  // tells the transaction to restart the entry-creation logic because the state
  // of the cache has changed.
  [-406]: 'CACHE_RACE',

  // The cache was unable to read a checksum record on an entry. This can be
  // returned from attempts to read from the cache. It is an internal error,
  // returned by the SimpleCache backend, but not by any URLRequest methods
  // or members.
  [-407]: 'CACHE_CHECKSUM_READ_FAILURE',

  // The cache found an entry with an invalid checksum. This can be returned from
  // attempts to read from the cache. It is an internal error, returned by the
  // SimpleCache backend, but not by any URLRequest methods or members.
  [-408]: 'CACHE_CHECKSUM_MISMATCH',

  // Internal error code for the HTTP cache. The cache lock timeout has fired.
  [-409]: 'CACHE_LOCK_TIMEOUT',

  // Received a challenge after the transaction has read some data, and the
  // credentials aren't available.  There isn't a way to get them at that point.
  [-410]: 'CACHE_AUTH_FAILURE_AFTER_READ',

  // Internal not-quite error code for the HTTP cache. In-memory hints suggest
  // that the cache entry would not have been usable with the transaction's
  // current configuration (e.g. load flags, mode, etc.)
  [-411]: 'CACHE_ENTRY_NOT_SUITABLE',

  // The disk cache is unable to doom this entry.
  [-412]: 'CACHE_DOOM_FAILURE',

  // The disk cache is unable to open or create this entry.
  [-413]: 'CACHE_OPEN_OR_CREATE_FAILURE',

  // The server's response was insecure (e.g. there was a cert error).
  [-501]: 'INSECURE_RESPONSE',

  // An attempt to import a client certificate failed, as the user's key
  // database lacked a corresponding private key.
  [-502]: 'NO_PRIVATE_KEY_FOR_CERT',

  // An error adding a certificate to the OS certificate database.
  [-503]: 'ADD_USER_CERT_FAILED',

  // An error occurred while handling a signed exchange.
  [-504]: 'INVALID_SIGNED_EXCHANGE',

  // An error occurred while handling a Web Bundle source.
  [-505]: 'INVALID_WEB_BUNDLE',

  // A Trust Tokens protocol operation-executing request failed for one of a
  // number of reasons (precondition failure, internal error, bad response).
  [-506]: 'TRUST_TOKEN_OPERATION_FAILED',

  // When handling a Trust Tokens protocol operation-executing request, the system
  // was able to execute the request's Trust Tokens operation without sending the
  // request to its destination: for instance, the results could have been present
  // in a local cache (for redemption) or the operation could have been diverted
  // to a local provider (for "platform-provided" issuance).
  [-507]: 'TRUST_TOKEN_OPERATION_SUCCESS_WITHOUT_SENDING_REQUEST',

  // This is a placeholder value that should never be used within //net.
  //
  // When Cronet APIs are being backed by HttpEngine (i.e., HttpEngineProvider is
  // being used), org.chromium.net.NetworkException#getCronetInternalErrorCode is
  // not supported (android.net.http.NetworkException#getCronetInternalErrorCode
  // does not exist). In this scenario, getCronetInternalErrorCode will always
  // return this error. This is a first step towards the deprecation of
  // getCronetInternalErrorCode.
  //
  // Temporarily terminate, then restart, ITTT to avoid unsupported nesting.
  // LINT.ThenChange(
  //      //tools/metrics/histograms/enums.xml:HTTPResponseAndNetErrorCodes,
  //      //tools/metrics/histograms/enums.xml:NetErrorCodes,
  // )
  // LINT.IfChange(HTTPENGINE_PROVIDER_IN_USE)
  [-508]: 'HTTPENGINE_PROVIDER_IN_USE',
  // LINT.ThenChange(
  //      //components/cronet/android/java/src/org/chromium/net/impl/AndroidNetworkExceptionWrapper.java:HTTPENGINE_PROVIDER_IN_USE,
  //      //tools/metrics/histograms/enums.xml:HTTPResponseAndNetErrorCodes,
  //      //tools/metrics/histograms/enums.xml:NetErrorCodes,
  // )
  // LINT.IfChange

  // *** Code -600 is reserved (was FTP_PASV_COMMAND_FAILED). ***
  // *** Code -601 is reserved (was FTP_FAILED). ***
  // *** Code -602 is reserved (was FTP_SERVICE_UNAVAILABLE). ***
  // *** Code -603 is reserved (was FTP_TRANSFER_ABORTED). ***
  // *** Code -604 is reserved (was FTP_FILE_BUSY). ***
  // *** Code -605 is reserved (was FTP_SYNTAX_ERROR). ***
  // *** Code -606 is reserved (was FTP_COMMAND_NOT_SUPPORTED). ***
  // *** Code -607 is reserved (was FTP_BAD_COMMAND_SEQUENCE). ***

  // PKCS #12 import failed due to incorrect password.
  [-701]: 'PKCS12_IMPORT_BAD_PASSWORD',

  // PKCS #12 import failed due to other error.
  [-702]: 'PKCS12_IMPORT_FAILED',

  // CA import failed - not a CA cert.
  [-703]: 'IMPORT_CA_CERT_NOT_CA',

  // Import failed - certificate already exists in database.
  // Note it's a little weird this is an error but reimporting a PKCS12 is ok
  // (no-op).  That's how Mozilla does it, though.
  [-704]: 'IMPORT_CERT_ALREADY_EXISTS',

  // CA import failed due to some other error.
  [-705]: 'IMPORT_CA_CERT_FAILED',

  // Server certificate import failed due to some internal error.
  [-706]: 'IMPORT_SERVER_CERT_FAILED',

  // PKCS #12 import failed due to invalid MAC.
  [-707]: 'PKCS12_IMPORT_INVALID_MAC',

  // PKCS #12 import failed due to invalid/corrupt file.
  [-708]: 'PKCS12_IMPORT_INVALID_FILE',

  // PKCS #12 import failed due to unsupported features.
  [-709]: 'PKCS12_IMPORT_UNSUPPORTED',

  // Key generation failed.
  [-710]: 'KEY_GENERATION_FAILED',

  // Error -711 was removed (ORIGIN_BOUND_CERT_GENERATION_FAILED)

  // Failure to export private key.
  [-712]: 'PRIVATE_KEY_EXPORT_FAILED',

  // Self-signed certificate generation failed.
  [-713]: 'SELF_SIGNED_CERT_GENERATION_FAILED',

  // The certificate database changed in some way.
  [-714]: 'CERT_DATABASE_CHANGED',

  // Error -715 was removed (CHANNEL_ID_IMPORT_FAILED)

  // The certificate verifier configuration changed in some way.
  [-716]: 'CERT_VERIFIER_CHANGED',

  // DNS error codes.

  // DNS resolver received a malformed response.
  [-800]: 'DNS_MALFORMED_RESPONSE',

  // DNS server requires TCP
  [-801]: 'DNS_SERVER_REQUIRES_TCP',

  // Error -802 was removed (DNS_SERVER_FAILED)

  // DNS transaction timed out.
  [-803]: 'DNS_TIMED_OUT',

  // The entry was not found in cache or other local sources, for lookups where
  // only local sources were queried.
  // TODO(ericorth): Consider renaming to DNS_LOCAL_MISS or something like that as
  // the cache is not necessarily queried either.
  [-804]: 'DNS_CACHE_MISS',

  // Suffix search list rules prevent resolution of the given host name.
  [-805]: 'DNS_SEARCH_EMPTY',

  // Failed to sort addresses according to RFC3484.
  [-806]: 'DNS_SORT_ERROR',

  // Error -807 was removed (DNS_HTTP_FAILED)

  // Failed to resolve the hostname of a DNS-over-HTTPS server.
  [-808]: 'DNS_SECURE_RESOLVER_HOSTNAME_RESOLUTION_FAILED',

  // DNS identified the request as disallowed for insecure connection (http/ws).
  // Error should be handled as if an HTTP redirect was received to redirect to
  // https or wss.
  [-809]: 'DNS_NAME_HTTPS_ONLY',

  // All DNS requests associated with this job have been cancelled.
  [-810]: 'DNS_REQUEST_CANCELLED',

  // The hostname resolution of HTTPS record was expected to be resolved with
  // alpn values of supported protocols, but did not.
  [-811]: 'DNS_NO_MATCHING_SUPPORTED_ALPN',

  // Error -812 was removed
  // Error -813 was removed

  // When checking whether secure DNS can be used, the response returned for the
  // requested probe record either had no answer or was invalid.
  [-814]: 'DNS_SECURE_PROBE_RECORD_INVALID',

  // Returned when DNS cache invalidation is in progress. This is a
  // transient error. Callers may want to retry later.
  [-815]: 'DNS_CACHE_INVALIDATION_IN_PROGRESS',

  // The DNS server responded with a format error response code.
  [-816]: 'DNS_FORMAT_ERROR',

  // The DNS server responded with a server failure response code.
  [-817]: 'DNS_SERVER_FAILURE',

  // The DNS server responded that the query type is not implemented.
  [-818]: 'DNS_NOT_IMPLEMENTED',

  // The DNS server responded that the request was refused.
  [-819]: 'DNS_REFUSED',

  // The DNS server responded with an rcode indicating that the request failed,
  // but the rcode is not one that we have a specific error code for. In other
  // words, the rcode was not one of the following:
  // - NOERR
  // - FORMERR
  // - SERVFAIL
  // - NXDOMAIN
  // - NOTIMP
  // - REFUSED
  [-820]: 'DNS_OTHER_FAILURE',

  // The following errors are for mapped from a subset of invalid
  // storage::BlobStatus.

  // The construction arguments are invalid. This is considered a bad IPC.
  [-900]: 'BLOB_INVALID_CONSTRUCTION_ARGUMENTS',

  // We don't have enough memory for the blob.
  [-901]: 'BLOB_OUT_OF_MEMORY',

  // We couldn't create or write to a file. File system error, like a full disk.
  [-902]: 'BLOB_FILE_WRITE_FAILED',

  // The renderer was destroyed while data was in transit.
  [-903]: 'BLOB_SOURCE_DIED_IN_TRANSIT',

  // The renderer destructed the blob before it was done transferring, and there
  // were no outstanding references (no one is waiting to read) to keep the
  // blob alive.
  [-904]: 'BLOB_DEREFERENCED_WHILE_BUILDING',

  // A blob that we referenced during construction is broken, or a browser-side
  // builder tries to build a blob with a blob reference that isn't finished
  // constructing.
  [-905]: 'BLOB_REFERENCED_BLOB_BROKEN',

  // A file that we referenced during construction is not accessible to the
  // renderer trying to create the blob.
  [-906]: 'BLOB_REFERENCED_FILE_UNAVAILABLE',
} as const;
