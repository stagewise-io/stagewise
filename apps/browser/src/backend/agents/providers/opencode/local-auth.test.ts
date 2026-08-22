import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authFilePath,
  getLocalOpenCodeApiKey,
  parseOpenCodeAuthCredentials,
} from './local-auth';

describe('parseOpenCodeAuthCredentials', () => {
  it('parses the OpenCode Go api credential', () => {
    const credentials = parseOpenCodeAuthCredentials(
      JSON.stringify({
        'opencode-go': { type: 'api', key: 'go-key' },
        opencode: { type: 'api', key: 'zen-key' },
      }),
    );
    expect(credentials['opencode-go']).toEqual({ type: 'api', key: 'go-key' });
  });

  it('returns an empty map for malformed JSON', () => {
    expect(parseOpenCodeAuthCredentials('not-json')).toEqual({});
  });

  it('preserves oauth-style credentials without a key', () => {
    const credentials = parseOpenCodeAuthCredentials(
      JSON.stringify({
        anthropic: { type: 'oauth', access: 'token', refresh: 'refresh' },
      }),
    );
    expect(credentials.anthropic?.type).toBe('oauth');
  });
});

describe('authFilePath', () => {
  it('uses XDG_DATA_HOME when provided', () => {
    expect(authFilePath({ XDG_DATA_HOME: '/data' })).toBe(
      '/data/opencode/auth.json',
    );
  });

  it('falls back to the XDG default under the home directory', () => {
    expect(authFilePath({})).toBe(
      join(homedir(), '.local', 'share', 'opencode', 'auth.json'),
    );
  });
});

describe('getLocalOpenCodeApiKey', () => {
  it('resolves the key for an api credential', async () => {
    await expect(
      getLocalOpenCodeApiKey('opencode-go', {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          'opencode-go': { type: 'api', key: 'go-key' },
        }),
      }),
    ).resolves.toBe('go-key');
  });

  it('never returns a non-api credential', async () => {
    await expect(
      getLocalOpenCodeApiKey('anthropic', {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          anthropic: { type: 'oauth', access: 'token' },
        }),
      }),
    ).resolves.toBeUndefined();
  });

  it('resolves to undefined when the provider is absent', async () => {
    await expect(
      getLocalOpenCodeApiKey('opencode-go', {
        OPENCODE_AUTH_CONTENT: '{}',
      }),
    ).resolves.toBeUndefined();
  });
});
