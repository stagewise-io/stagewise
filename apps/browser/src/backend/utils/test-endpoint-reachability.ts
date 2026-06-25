import http from 'node:http';
import https from 'node:https';
import type { ApiSpec } from '@shared/karton-contracts/ui/shared-types';

export type EndpointReachabilityResult =
  | { reachable: true; status: number }
  | { reachable: false; reason: string };

/**
 * Per-spec probe configuration.
 *
 * Each entry mirrors the exact URL path and HTTP method the AI SDK uses
 * when making model inference requests in production, so the reachability
 * test validates the same path the agent will actually call.
 *
 * - 404 → server is up but the inference path doesn't exist (wrong base URL
 *   or API spec mismatch)
 * - Any other status (400, 401, 403, 405, 500, …) → server is reachable
 * - Network errors → server is unreachable
 *
 * Sources (AI SDK internal modules):
 * - @ai-sdk/openai chat:     POST {baseURL}/chat/completions
 * - @ai-sdk/openai responses: POST {baseURL}/responses
 * - @ai-sdk/anthropic:        POST {baseURL}/messages
 * - @ai-sdk/google:           POST {baseURL}/models/{modelId}:generateContent
 *                             (probe uses GET /models — the list endpoint)
 * - @ai-sdk/azure:            POST {baseURL}/openai/deployments/{id}/chat/completions
 *                             (probe uses GET /openai — full path needs deploymentId)
 * - amazon-bedrock:           AWS SigV4-signed URLs, cannot probe with plain HTTP
 * - google-vertex:            Google OAuth + signed URLs, cannot probe with plain HTTP
 */
type ProbeConfig = {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly label: string;
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
  },
  'openai-responses': {
    path: '/responses',
    method: 'POST',
    label: 'OpenAI Responses',
  },
  anthropic: {
    path: '/messages',
    method: 'POST',
    label: 'Anthropic Messages',
  },
  google: {
    path: '/models',
    method: 'GET',
    label: 'Google Generative AI',
  },
  azure: {
    path: '/openai',
    method: 'GET',
    label: 'Azure OpenAI',
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
 * Probe a custom endpoint for reachability using the per-spec configuration.
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
    // Can't probe — just validate the URL was well-formed
    return { reachable: true, status: 0 };
  }

  const probeUrl = new URL(`${trimmed.replace(/\/$/, '')}${config.path}`);
  const isHttps = probeUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise<EndpointReachabilityResult>((resolve) => {
    const req = transport.request(
      probeUrl,
      {
        method: config.method,
        headers: {
          // Some APIs require an Authorization header to return anything
          // other than a connection reset; sending a dummy key avoids that.
          Authorization: 'Bearer probe',
          ...(config.method === 'POST' ? { 'Content-Length': '0' } : {}),
        },
        timeout: 3000,
      },
      (response) => {
        response.resume();
        const status = response.statusCode ?? 0;

        if (status === 404) {
          resolve({
            reachable: false,
            reason: `Server returned 404 at ${config.path}. The base URL or API spec may be incorrect — ${config.label} expects ${config.method} ${config.path}.`,
          });
          return;
        }

        // Any other status (400, 401, 403, 405, 500) = reachable
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

    req.end();
  });
}
