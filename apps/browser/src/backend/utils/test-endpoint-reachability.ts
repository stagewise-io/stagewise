import http from 'node:http';
import https from 'node:https';
import type { ApiSpec } from '@shared/karton-contracts/ui/shared-types';

export type EndpointReachabilityResult =
  | { reachable: true; status: number }
  | { reachable: false; reason: string };

/**
 * Minimal request bodies per spec. These are intentionally invalid (dummy
 * model names, empty messages) so the server returns a 4xx error — but
 * a *structured JSON* error, not a 404 or HTML page. This proves the
 * server implements the expected API spec.
 */
const PROBE_BODIES: Partial<Record<ApiSpec, string>> = {
  'openai-chat-completions': JSON.stringify({
    model: '__probe__',
    messages: [{ role: 'user', content: '' }],
    max_tokens: 1,
  }),
  'openai-responses': JSON.stringify({
    model: '__probe__',
    input: '',
  }),
  anthropic: JSON.stringify({
    model: '__probe__',
    messages: [{ role: 'user', content: '' }],
    max_tokens: 1,
  }),
};

/**
 * Per-spec probe configuration.
 *
 * Each entry mirrors the exact URL path and HTTP method the AI SDK uses
 * when making model inference requests in production. The probe sends a
 * minimal (intentionally invalid) request body and checks that the server
 * returns a structured JSON response rather than a 404 or HTML page.
 *
 * Result interpretation:
 * - 404                    → inference path doesn't exist (wrong base URL or spec)
 * - 4xx/5xx with JSON body → server implements the API (reachable + compliant)
 * - 4xx/5xx without JSON   → server is up but doesn't implement the expected spec
 * - Network errors         → server is unreachable
 *
 * Sources (AI SDK internal modules):
 * - @ai-sdk/openai chat:      POST {baseURL}/chat/completions
 * - @ai-sdk/openai responses: POST {baseURL}/responses
 * - @ai-sdk/anthropic:         POST {baseURL}/messages
 * - @ai-sdk/google:            POST {baseURL}/models/{modelId}:generateContent
 *                              (probe uses GET /models — the list endpoint)
 * - @ai-sdk/azure:             POST {baseURL}/openai/deployments/{id}/chat/completions
 *                              (probe uses GET /openai — full path needs deploymentId)
 * - amazon-bedrock:            AWS SigV4-signed URLs, cannot probe with plain HTTP
 * - google-vertex:             Google OAuth + signed URLs, cannot probe with plain HTTP
 */
type ProbeConfig = {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly label: string;
  /** Whether to validate the response body is JSON (API compliance check). */
  readonly validateJsonBody: boolean;
};

type UnprobeableConfig = {
  readonly unprobeable: true;
  readonly reason: string;
};

const SPEC_PROBE_CONFIGS: Record<ApiSpec, ProbeConfig | UnprobeableConfig> = {
  'openai-chat-completions': {
    path: '/chat/completions',
    method: 'POST',
    label: 'OpenAI Chat Completions',
    validateJsonBody: true,
  },
  'openai-responses': {
    path: '/responses',
    method: 'POST',
    label: 'OpenAI Responses',
    validateJsonBody: true,
  },
  anthropic: {
    path: '/messages',
    method: 'POST',
    label: 'Anthropic Messages',
    validateJsonBody: true,
  },
  google: {
    path: '/models',
    method: 'GET',
    label: 'Google Generative AI',
    validateJsonBody: true,
  },
  azure: {
    path: '/openai',
    method: 'GET',
    label: 'Azure OpenAI',
    validateJsonBody: false,
  },
  'amazon-bedrock': {
    unprobeable: true,
    reason:
      'Amazon Bedrock uses AWS SigV4 authentication and cannot be probed with a plain HTTP request. The endpoint will be validated on first model use.',
  },
  'google-vertex': {
    unprobeable: true,
    reason:
      'Google Vertex AI uses Google OAuth and service account credentials. The endpoint will be validated on first model use.',
  },
};

/**
 * Read the first N bytes of a response stream as text.
 * Drains the rest to free the socket.
 */
function readBodyHead(
  response: http.IncomingMessage,
  maxBytes = 2048,
): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    };

    response.on('data', (chunk: Buffer) => {
      if (total < maxBytes) {
        chunks.push(chunk);
        total += chunk.length;
      }
    });
    response.on('end', finish);
    response.on('error', finish);
    response.on('close', finish);
  });
}

/**
 * Check whether a response body looks like a JSON API error, not an HTML
 * page or plain text. We look for the `content-type` header and/or try to
 * parse the body as JSON.
 */
function isJsonApiResponse(
  response: http.IncomingMessage,
  bodyHead: string,
): boolean {
  const contentType = response.headers['content-type'] ?? '';
  if (contentType.includes('application/json')) return true;
  if (contentType.includes('text/html')) return false;

  // No content-type hint — try to parse the body
  const trimmed = bodyHead.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Not valid JSON but starts with { or [ — likely a JSON-ish response
      return true;
    }
  }
  // HTML or plain text — not a JSON API
  if (trimmed.startsWith('<') || trimmed.startsWith('<!')) return false;
  return false;
}

/**
 * Probe a custom endpoint for reachability and API compliance using the
 * per-spec configuration.
 *
 * @see SPEC_PROBE_CONFIGS for the exact paths and methods used per API spec.
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

  const config = SPEC_PROBE_CONFIGS[apiSpec];

  if ('unprobeable' in config) {
    return { reachable: true, status: 0 };
  }

  const probeUrl = new URL(`${trimmed.replace(/\/$/, '')}${config.path}`);
  const isHttps = probeUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const body = PROBE_BODIES[apiSpec];
  const bodyBuffer = body ? Buffer.from(body) : null;

  return new Promise<EndpointReachabilityResult>((resolve) => {
    const req = transport.request(
      probeUrl,
      {
        method: config.method,
        headers: {
          Authorization: 'Bearer probe',
          Accept: 'application/json',
          ...(config.method === 'POST' && bodyBuffer
            ? {
                'Content-Type': 'application/json',
                'Content-Length': bodyBuffer.length,
              }
            : {}),
        },
        timeout: 5000,
      },
      async (response) => {
        const status = response.statusCode ?? 0;
        const bodyHead = await readBodyHead(response);

        if (status === 404) {
          resolve({
            reachable: false,
            reason: `Server returned 404 at ${config.path}. The base URL or API spec may be incorrect — ${config.label} expects ${config.method} ${config.path}.`,
          });
          return;
        }

        // For specs where we validate JSON compliance, check the response
        if (config.validateJsonBody && !isJsonApiResponse(response, bodyHead)) {
          resolve({
            reachable: false,
            reason: `Server responded at ${config.path} but did not return a JSON API response (status ${status}). This URL may not implement the ${config.label} API spec.`,
          });
          return;
        }

        // Server is reachable and responds with the expected API format
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
        reason: 'Connection timed out after 5 seconds',
      });
    });

    if (config.method === 'POST' && bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}
