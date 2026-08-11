import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExecutable } from './adapter';
import { ACP_ADAPTERS } from './adapter-registry';

describe('ACP adapters', () => {
  it('finds Windows command shims installed by npm', async () => {
    const root = await mkdtemp(nodePath.join(tmpdir(), 'stagewise-path-'));
    try {
      const shim = nodePath.join(root, 'codex.cmd');
      await writeFile(shim, '@echo off\r\n', { mode: 0o755 });

      await expect(
        findExecutable('codex', { PATH: root }, 'win32'),
      ).resolves.toBe(shim);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it('configures OpenCode shell approvals without replacing other settings', async () => {
    const env = await ACP_ADAPTERS.opencode.environment(
      {
        OPENCODE_CONFIG_CONTENT: JSON.stringify({
          theme: 'stagewise',
          permission: { edit: 'deny' },
        }),
      },
      'alwaysAsk',
    );

    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}')).toEqual({
      theme: 'stagewise',
      experimental: { mcp_timeout: 43_200_000 },
      permission: { edit: 'deny', bash: 'ask' },
    });
    expect(ACP_ADAPTERS.opencode.processKeyForApproval?.('alwaysAllow')).toBe(
      'allow',
    );
  });

  it.each([
    ['Codex', ACP_ADAPTERS.codex],
    ['Claude Code', ACP_ADAPTERS['claude-code']],
  ] as const)('requires a user-installed %s CLI', async (name, adapter) => {
    await expect(
      adapter.environment({ PATH: '', Path: '' }, 'smart'),
    ).rejects.toThrow(`${name} is not installed`);
  });

  it('requires a user-installed OpenCode CLI', async () => {
    await expect(
      ACP_ADAPTERS.opencode.resolveLaunch('node', {
        HOME: '/stagewise-missing-home',
        PATH: '',
        Path: '',
      }),
    ).rejects.toThrow('OpenCode is not installed');
  });

  it('forces Claude shell commands through manual approval in Always ask', () => {
    expect(ACP_ADAPTERS['claude-code'].newSessionMeta?.('alwaysAsk')).toEqual({
      claudeCode: {
        options: {
          settings: {
            permissions: {
              ask: ['Bash(*)'],
              defaultMode: 'default',
            },
          },
        },
      },
    });
    expect(
      ACP_ADAPTERS['claude-code'].newSessionMeta?.('smart'),
    ).toBeUndefined();
  });
});
