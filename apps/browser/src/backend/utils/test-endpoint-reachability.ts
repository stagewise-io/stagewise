import http from 'node:http';
import https from 'node:https';
import type { ApiSpec } from '@shared/karton-contracts/ui/shared-types';

/**
 * Spec-specific paths appended to the base URL for reachability probing.
 *
 * These paths correspond to the endpoints the AI SDK calls when making
 * actual model requests. A 404 on these paths means the server doesn't
 * implement the expected API, while any other response (even 401/403)
 * confirms the server is reachable.
 */
const SPEC_PROBE_PATHS: Record<ApiSpec, string> = {
  'openai-chat-completions': '/chat/completions',
  'openai-responses': '/responses',
  anthropic: '/messages',
  google: '',
  azure: '/chat/completions',
  'amazon-bedrock': '',
  'google-vertex': '',
};

export type EndpointReachabilityResult =
  | { reachable: true; status: number }
  | { reachable: false; reason: string };

/**
 * Probe a custom endpoint for reachability.
 *
 * Appends the spec-specific path to the base URL and issues an HTTP GET
 * request using node:http / node:https (not global fetch, which has
 * unreliable AbortController support in the Electron main process).
 *
 * Any response (even an auth error like 401) means the server is reachable.
 * A 404 specifically means the server is up but doesn't implement the expected
 * API path. Network errors (ECONNREFUSED, DNS failures, timeouts) mean the
 * server is unreachable.
 */
export async function testEndpointReachability(
  baseUrl: string,
  apiSpec: ApiSpec,
): Promise<EndpointReachabilityResult> {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { reachable: false, reason: 'Base URL is empty' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { reachable: false, reason: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      reachable: false,
      reason: 'URL must use http or https protocol',
    };
  }

  const probePath = SPEC_PROBE_PATHS[apiSpec] ?? '';
  const probeUrl = new URL(`${trimmed.replace(/\/$/, '')}${probePath}`);

  const isHttps = probeUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise<EndpointReachabilityResult>((resolve) => {
    const req = transport.get(
      probeUrl,
      {
        // Some APIs require an Authorization header to return anything
        // other than a connection reset; sending a dummy key avoids that.
        headers: { Authorization: 'Bearer probe' },
        timeout: 3000,
      },
      (response) => {
        // Drain the response to free the socket
        response.resume();
        const status = response.statusCode ?? 0;

        if (status === 404) {
          resolve({
            reachable: false,
            reason: `Server returned 404 at ${probePath || '/'}. Check that the base URL and API spec are correct.`,
          });
          return;
        }

        // Any other status (including 401, 403, 500) means the server is reachable
        resolve({ reachable: true, status });
      },
    );

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        resolve({
          reachable: false,
          reason:
            'Connection refused. Check that the server is running and the URL is correct.',
        });
        return;
      }
      if (err.code === 'ENOTFOUND') {
        resolve({
          reachable: false,
          reason: 'Host not found. Check that the domain name is correct.',
        });
        return;
      }
      resolve({
        reachable: false,
        reason: `Could not connect: ${err.message}`,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        reachable: false,
        reason: 'Connection timed out after 3 seconds',
      });
    });
  });
}
