const PLACEHOLDER_RE = /\{\{CRED:[^}]+\}\}/g;

/**
 * Enriched secret map entry: the real value plus the origins it may be
 * sent to.
 */
export interface SecretMapEntry {
  value: string;
  allowedOrigins: string[];
}

/**
 * Extract the origin (`scheme://host[:port]`) from a URL string.
 * Returns `null` for non-parseable URLs so callers can decide how to
 * handle them.
 */
function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Find all `{{CRED:...}}` placeholders present in a string.
 */
function findPlaceholders(input: string): string[] {
  return input.match(PLACEHOLDER_RE) ?? [];
}

/**
 * Collect all credential placeholders that appear anywhere in the
 * request (URL, headers, body).
 */
function collectRequestPlaceholders(
  url: string,
  headers?: HeadersInit,
  body?: BodyInit | null,
): Set<string> {
  const found = new Set<string>();

  for (const p of findPlaceholders(url)) found.add(p);

  if (headers) {
    const values = headerValues(headers);
    for (const v of values) {
      for (const p of findPlaceholders(v)) found.add(p);
    }
  }

  if (typeof body === 'string') {
    for (const p of findPlaceholders(body)) found.add(p);
  }

  return found;
}

/**
 * Extract all header values as plain strings regardless of the
 * `HeadersInit` variant.
 */
function headerValues(headers: HeadersInit): string[] {
  if (Array.isArray(headers)) {
    return (headers as [string, string][]).map(([, v]) => v);
  }
  if (
    typeof headers === 'object' &&
    typeof (headers as Headers).entries === 'function'
  ) {
    const vals: string[] = [];
    for (const [, value] of (headers as Headers).entries()) {
      vals.push(value);
    }
    return vals;
  }
  return Object.values(headers as Record<string, string>);
}

/**
 * Check whether `origin` matches a single `pattern`.
 *
 * Patterns are origin strings (`scheme://host[:port]`) that may contain
 * `*` as a **whole** dot-separated segment to match exactly one label.
 *
 * Examples:
 * - `'https://api.figma.com'`      — exact match only
 * - `'https://*.supabase.co'`      — matches `https://xyz.supabase.co`
 * - `'https://*.api.example.com'`  — matches `https://us1.api.example.com`
 *
 * A bare `*` as the entire host (e.g. `'https://*'`) is intentionally
 * disallowed — every segment of the pattern must correspond to a segment
 * in the origin.
 */
function originMatchesPattern(origin: string, pattern: string): boolean {
  // Fast path: exact equality (covers all non-wildcard patterns).
  if (origin === pattern) return true;
  if (!pattern.includes('*')) return false;

  // Split scheme from host manually to avoid URL normalisation
  // lowercasing the wildcard placeholder.
  const pIdx = pattern.indexOf('://');
  const oIdx = origin.indexOf('://');
  if (pIdx === -1 || oIdx === -1) return false;

  const pScheme = pattern.slice(0, pIdx);
  const oScheme = origin.slice(0, oIdx);
  if (pScheme !== oScheme) return false;

  // Everything after "://" up to the first "/" (or end) is host[:port].
  const pHostRaw = pattern.slice(pIdx + 3).split('/')[0];
  const oHostRaw = origin.slice(oIdx + 3).split('/')[0];

  const pParts = pHostRaw.split('.');
  const oParts = oHostRaw.split('.');
  if (pParts.length !== oParts.length) return false;

  return pParts.every((seg, i) => seg === '*' || seg === oParts[i]);
}

/**
 * Validate that every placeholder used in the request is allowed to be
 * sent to `destinationOrigin`. Throws with a descriptive message if any
 * placeholder is disallowed.
 */
function assertOriginsAllowed(
  placeholders: Set<string>,
  secrets: Map<string, SecretMapEntry>,
  destinationOrigin: string,
): void {
  for (const placeholder of placeholders) {
    const entry = secrets.get(placeholder);
    if (!entry) continue;
    if (
      !entry.allowedOrigins.some((pattern) =>
        originMatchesPattern(destinationOrigin, pattern),
      )
    ) {
      const typeId = placeholder.split(':')[1] ?? 'unknown';
      throw new Error(
        `Credential "${typeId}" is not allowed to be sent to ` +
          `${destinationOrigin}. Allowed origins: ` +
          `${entry.allowedOrigins.join(', ') || '(none)'}`,
      );
    }
  }
}

/**
 * Build a flat placeholder-to-value map from the enriched secret map.
 * Used for the actual string substitution after origin checks pass.
 */
function flatValueMap(
  secrets: Map<string, SecretMapEntry>,
): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [k, v] of secrets) {
    flat.set(k, v.value);
  }
  return flat;
}

/**
 * Replace all `{{CRED:<typeId>:<field>:<nonce>}}` placeholders in a string
 * with the corresponding real secret values from the map.
 * Unrecognised placeholders are left as-is.
 */
export function substitutePlaceholders(
  input: string,
  values: Map<string, string>,
): string {
  if (values.size === 0) return input;
  return input.replace(PLACEHOLDER_RE, (match) => values.get(match) ?? match);
}

/**
 * Substitute credential placeholders in all header values.
 * Supports plain objects, `Headers` instances, and `[string, string][]` tuples.
 * Returns the same structural type that was passed in.
 */
function substituteHeaders(
  headers: HeadersInit | undefined,
  values: Map<string, string>,
): HeadersInit | undefined {
  if (!headers) return headers;

  if (Array.isArray(headers)) {
    return (headers as [string, string][]).map(
      ([k, v]) => [k, substitutePlaceholders(v, values)] as [string, string],
    );
  }

  if (
    typeof headers === 'object' &&
    typeof (headers as Headers).entries === 'function'
  ) {
    const original = headers as Headers;
    const replaced = new Headers();
    for (const [key, value] of original.entries()) {
      replaced.set(key, substitutePlaceholders(value, values));
    }
    return replaced;
  }

  const obj: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    headers as Record<string, string>,
  )) {
    obj[key] = substitutePlaceholders(value, values);
  }
  return obj;
}

/**
 * Returns true if the value looks like a Request object (duck-typing).
 * We cannot use `instanceof Request` because objects created inside the
 * VM context are instances of the VM's Request class, not the host's.
 */
function isRequestLike(input: unknown): input is {
  url: string;
  headers: Headers;
  method: string;
  body: ReadableStream | null;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  mode?: RequestMode;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  integrity?: string;
  keepalive?: boolean;
  duplex?: string;
  clone: () => unknown;
} {
  return (
    typeof input === 'object' &&
    input !== null &&
    'url' in input &&
    typeof (input as Record<string, unknown>).url === 'string' &&
    'headers' in input
  );
}

/**
 * Create a `fetch` wrapper that transparently substitutes credential
 * placeholders with real secret values before the request leaves the
 * process, **only** when the destination origin is on the credential's
 * allowlist.
 *
 * Runs in the sandbox worker's **host scope** (outside the VM) so that
 * real secret values are never exposed to code running inside the VM
 * context.
 *
 * Security behaviour:
 * - If any credential placeholder targets a disallowed origin the call
 *   throws immediately (no network request is made).
 * - When credential placeholders are present the request is forced to
 *   `redirect: 'manual'` to prevent automatic redirect-based
 *   exfiltration to a different origin.
 *
 * @param realFetch  The original Node.js `fetch` function.
 * @param getSecretMap  Getter returning the current enriched secret map.
 *                      Called on every `fetch` invocation so newly
 *                      resolved credentials are picked up immediately.
 */
export function createCredentialFetch(
  realFetch: typeof globalThis.fetch,
  getSecretMap: () => Map<string, SecretMapEntry>,
): typeof globalThis.fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const secrets = getSecretMap();

      if (secrets.size === 0) {
        return realFetch(input, init);
      }

      if (typeof input === 'string') {
        return handleString(realFetch, input, init, secrets);
      }

      if (input instanceof URL) {
        return handleString(realFetch, input.href, init, secrets);
      }

      if (isRequestLike(input)) {
        return handleRequest(realFetch, input, init, secrets);
      }

      return realFetch(input, init);
    } catch (err) {
      return Promise.reject(err);
    }
  };
}

function handleString(
  realFetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit | undefined,
  secrets: Map<string, SecretMapEntry>,
): Promise<Response> {
  const placeholders = collectRequestPlaceholders(
    url,
    init?.headers ?? undefined,
    init?.body,
  );
  const hasCredentials = placeholders.size > 0;

  if (hasCredentials) {
    const origin = extractOrigin(url);
    if (!origin) {
      throw new Error(
        `Cannot determine origin of URL "${url}" for credential ` +
          'origin check. Refusing to send credentials.',
      );
    }
    assertOriginsAllowed(placeholders, secrets, origin);
  }

  const values = flatValueMap(secrets);
  const patchedUrl = substitutePlaceholders(url, values);
  let patchedInit = init ? patchInit(init, values) : undefined;

  if (hasCredentials) {
    patchedInit = forceManualRedirect(patchedInit);
  }

  return realFetch(patchedUrl, patchedInit);
}

function handleRequest(
  realFetch: typeof globalThis.fetch,
  input: {
    url: string;
    headers: Headers;
    method: string;
    body: ReadableStream | null;
    signal?: AbortSignal;
    redirect?: RequestRedirect;
    referrer?: string;
  },
  init: RequestInit | undefined,
  secrets: Map<string, SecretMapEntry>,
): Promise<Response> {
  const placeholders = collectRequestPlaceholders(
    input.url,
    input.headers,
    init?.body ?? undefined,
  );
  const hasCredentials = placeholders.size > 0;

  if (hasCredentials) {
    const origin = extractOrigin(input.url);
    if (!origin) {
      throw new Error(
        `Cannot determine origin of URL "${input.url}" for credential ` +
          'origin check. Refusing to send credentials.',
      );
    }
    assertOriginsAllowed(placeholders, secrets, origin);
  }

  const values = flatValueMap(secrets);
  const url = substitutePlaceholders(input.url, values);
  const headers = substituteHeaders(input.headers, values);
  let newInit: RequestInit = {
    method: input.method,
    headers,
    redirect: input.redirect,
    signal: input.signal,
    referrer: input.referrer,
    ...patchInit(init ?? {}, values),
  };
  if (
    input.body !== null &&
    input.method !== 'GET' &&
    input.method !== 'HEAD'
  ) {
    newInit.body = input.body;
  }

  if (hasCredentials) {
    newInit = forceManualRedirect(newInit);
  }

  return realFetch(url, newInit);
}

/**
 * Patch a `RequestInit` object by substituting placeholders in headers
 * and string bodies.
 */
function patchInit(
  init: RequestInit,
  values: Map<string, string>,
): RequestInit {
  const patched: RequestInit = { ...init };

  if (init.headers) {
    patched.headers = substituteHeaders(init.headers, values);
  }

  if (typeof init.body === 'string') {
    patched.body = substitutePlaceholders(init.body, values);
  }

  return patched;
}

/**
 * Force `redirect: 'manual'` on a `RequestInit` to prevent the runtime
 * from automatically following redirects that could send credentials to
 * an unvetted origin.
 */
function forceManualRedirect(init?: RequestInit): RequestInit {
  return { ...init, redirect: 'manual' };
}
