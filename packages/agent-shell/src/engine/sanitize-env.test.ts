import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeEnv, BLOCKLIST } from './sanitize-env';

describe('sanitizeEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('strips sensitive vars', () => {
    process.env.MY_SECRET_TOKEN = 'abc';
    process.env.DB_PASSWORD = 'xyz';
    process.env.PRIVATE_KEY_DATA = 'secret';

    const env = sanitizeEnv();

    expect(env.MY_SECRET_TOKEN).toBeUndefined();
    expect(env.DB_PASSWORD).toBeUndefined();
    expect(env.PRIVATE_KEY_DATA).toBeUndefined();
  });

  it('whitelist wins over sensitive patterns', () => {
    process.env.SHELL = '/bin/zsh';
    process.env.PATH = '/usr/bin';
    process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent';

    const env = sanitizeEnv();

    expect(env.SHELL).toBe('/bin/zsh');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
  });

  it('strips ELECTRON_ vars', () => {
    process.env.ELECTRON_RUN_AS_NODE = '1';
    process.env.ELECTRON_OZONE_PLATFORM_HINT = 'auto';

    const env = sanitizeEnv();

    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBeUndefined();
  });

  it('sets STAGEWISE_SHELL marker', () => {
    const env = sanitizeEnv();
    expect(env.STAGEWISE_SHELL).toBe('1');
  });

  it('omits undefined values', () => {
    const env = sanitizeEnv();
    for (const value of Object.values(env)) {
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
    }
  });

  it('passes through normal vars', () => {
    process.env.SOME_NORMAL_VAR = 'hello';

    const env = sanitizeEnv();

    expect(env.SOME_NORMAL_VAR).toBe('hello');
  });

  describe('host-process contamination blocklist', () => {
    // BLOCKLIST only applies when falling back to process.env (no
    // resolved shell env). When a resolved env is available, values
    // come from the user's own shell profile and should pass through.

    it('strips NODE_ENV from process.env fallback', () => {
      process.env.NODE_ENV = 'production';

      const env = sanitizeEnv();

      expect(env.NODE_ENV).toBeUndefined();
    });

    it('preserves NODE_ENV from resolvedEnv (user-set in .zshrc)', () => {
      const env = sanitizeEnv({
        PATH: '/usr/bin',
        NODE_ENV: 'development',
      });

      expect(env.NODE_ENV).toBe('development');
    });

    it('strips all blocklisted vars from process.env fallback', () => {
      for (const key of BLOCKLIST) {
        process.env[key] = 'should-be-stripped';
      }

      const env = sanitizeEnv();

      for (const key of BLOCKLIST) {
        expect(env[key]).toBeUndefined();
      }
    });

    it('preserves non-sensitive blocklisted vars from resolvedEnv', () => {
      // Only non-sensitive blocklisted vars should pass through from
      // resolved env. Keys like POSTHOG_API_KEY still get stripped by
      // the sensitive-pattern filter even from resolved env.
      const nonSensitive = [
        'NODE_ENV',
        'BUILD_MODE',
        'POSTHOG_HOST',
        'STAGEWISE_CONSOLE_URL',
        'API_URL',
        'LLM_PROXY_URL',
        'UPDATE_SERVER_ORIGIN',
        'SUPABASE_URL',
      ];
      const resolved: Record<string, string> = {};
      for (const key of nonSensitive) {
        resolved[key] = 'user-set';
      }

      const env = sanitizeEnv(resolved);

      for (const key of nonSensitive) {
        expect(env[key]).toBe('user-set');
      }
    });

    it('strips BUILD_MODE from process.env even though it is not sensitive', () => {
      process.env.BUILD_MODE = 'production';

      const env = sanitizeEnv();

      expect(env.BUILD_MODE).toBeUndefined();
    });
  });

  it('strips the inherited shell-integration guard so each PTY can re-source', () => {
    // If this leaks into the spawn env, the integration script's first-line
    // guard short-circuits before registering OSC 133 hooks and every session
    // falls back to sentinel mode.
    process.env.__STAGEWISE_SHELL_INTEGRATION = '1';

    const env = sanitizeEnv();

    expect(env.__STAGEWISE_SHELL_INTEGRATION).toBeUndefined();
  });

  describe('windows locale overrides', () => {
    let originalPlatform: NodeJS.Platform;

    beforeEach(() => {
      originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      // Clear inherited host locale so the whitelist doesn't pass them
      // through from process.env and mask the Windows-specific logic.
      delete process.env.LC_ALL;
      delete process.env.LC_CTYPE;
      delete process.env.LANG;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('applies C.UTF-8 locale for bash', () => {
      const env = sanitizeEnv(undefined, 'bash');
      expect(env.LC_ALL).toBe('C.UTF-8');
      expect(env.LC_CTYPE).toBe('C.UTF-8');
      expect(env.LANG).toBe('C.UTF-8');
    });

    it('skips C.UTF-8 locale for powershell', () => {
      const env = sanitizeEnv(undefined, 'powershell');
      expect(env.LC_ALL).toBeUndefined();
      expect(env.LC_CTYPE).toBeUndefined();
      expect(env.LANG).toBeUndefined();
    });

    it('applies C.UTF-8 locale when shell type is unknown (conservative default)', () => {
      const env = sanitizeEnv();
      expect(env.LC_ALL).toBe('C.UTF-8');
    });
  });

  it('uses resolvedEnv as base when provided', () => {
    process.env.FROM_PROCESS = 'process';

    const resolved = {
      FROM_RESOLVED: 'resolved',
      PATH: '/custom/bin:/usr/bin',
      MY_SECRET_TOKEN: 'leaked',
      ELECTRON_RUN_AS_NODE: '1',
    };

    const env = sanitizeEnv(resolved);

    expect(env.FROM_RESOLVED).toBe('resolved');
    expect(env.PATH).toBe('/custom/bin:/usr/bin');
    expect(env.FROM_PROCESS).toBeUndefined();
    expect(env.MY_SECRET_TOKEN).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.STAGEWISE_SHELL).toBe('1');
  });

  describe('forAgent option', () => {
    it('applies agent-specific env by default (STAGEWISE_SHELL, HISTFILE)', () => {
      const env = sanitizeEnv();

      expect(env.STAGEWISE_SHELL).toBe('1');
      expect(env.HISTFILE).toBe('/dev/null');
      expect(env.HISTSIZE).toBe('0');
      expect(env.SAVEHIST).toBe('0');
    });

    it('omits agent-specific env when forAgent is false', () => {
      const env = sanitizeEnv(undefined, undefined, { forAgent: false });

      expect(env.STAGEWISE_SHELL).toBeUndefined();
      expect(env.HISTFILE).toBeUndefined();
      expect(env.HISTSIZE).toBeUndefined();
      expect(env.SAVEHIST).toBeUndefined();
    });

    it('preserves user-set vars from resolved env for user terminals', () => {
      const env = sanitizeEnv(
        { NODE_ENV: 'development', PATH: '/usr/bin' },
        undefined,
        { forAgent: false },
      );

      // Resolved env values come from the user's shell profile — pass through.
      expect(env.NODE_ENV).toBe('development');
      expect(env.PATH).toBe('/usr/bin');
    });

    it('strips blocklisted vars from process.env fallback for user terminals', () => {
      process.env.NODE_ENV = 'production';

      const env = sanitizeEnv(undefined, undefined, { forAgent: false });

      expect(env.NODE_ENV).toBeUndefined();
    });
  });
});
