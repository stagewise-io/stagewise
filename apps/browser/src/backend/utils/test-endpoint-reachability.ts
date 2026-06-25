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
 * Appends the spec-specific path to the base URL and issues a HEAD request.
 * Any response (even an auth error like 401) means the server is reachable.
 * A 404 specifically means the server is up but doesn't implement the expected
 * API path. Network errors (ECONNREFUSED, DNS failures, timeouts) mean the
 * server is unreachable.
 *
 * Cloud providers (Google, Bedrock, Vertex) use complex auth schemes that
 * can't be probed with a simple HTTP request — for those we only verify
 * the URL is well-formed and returns a 200.
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
  const probeUrl = `${trimmed.replace(/\/$/, '')}${probePath}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(probeUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        // Some APIs require an Authorization header to return anything
        // other than a connection reset; sending a dummy key avoids that.
        Authorization: 'Bearer probe',
      },
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return {
        reachable: false,
        reason: `Server returned 404 at ${probePath || '/'}. Check that the base URL and API spec are correct.`,
      };
    }

    // Any other status (including 401, 403, 500) means the server is reachable
    return { reachable: true, status: response.status };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        reachable: false,
        reason: 'Connection timed out after 5 seconds',
      };
    }
    return {
      reachable: false,
      reason: `Could not connect: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
