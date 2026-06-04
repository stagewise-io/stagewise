import { describe, expect, it } from 'vitest';
import {
  SHELLS_DOMAIN_SCHEMA_VERSION,
  createShellsDomainAdapter,
} from './shells-domain-adapter';

const SHELL_INFO = { platform: 'darwin', type: 'zsh', path: '/bin/zsh' };

function makeSession(
  over: Partial<{
    id: string;
    exited: boolean;
    exitCode: number | null;
    lineCount: number;
    logPath: string;
    cwd: string;
    tailContent: string;
    createdAt: number;
  }> = {},
) {
  return {
    id: over.id ?? 's1',
    exited: over.exited ?? false,
    exitCode: over.exitCode ?? null,
    lineCount: over.lineCount ?? 0,
    logPath: over.logPath ?? 'shells/s1.shell.log',
    cwd: over.cwd ?? '/repo',
    createdAt: over.createdAt ?? 1,
    ...(over.tailContent !== undefined
      ? { tailContent: over.tailContent }
      : {}),
  };
}

describe('createShellsDomainAdapter', () => {
  it('reports the expected contract metadata', () => {
    const adapter = createShellsDomainAdapter({
      getSnapshot: () => ({ sessions: [] }),
      getShellInfo: () => SHELL_INFO,
    });
    expect(adapter.domainId).toBe('shells');
    expect(adapter.renderOrder).toBe(2);
    expect(adapter.schemaVersion).toBe(SHELLS_DOMAIN_SCHEMA_VERSION);
  });

  it('renders <shell> + <shell-sessions> for the keyframe', () => {
    const adapter = createShellsDomainAdapter({
      getSnapshot: () => ({ sessions: [makeSession({ cwd: '/p' })] }),
      getShellInfo: () => SHELL_INFO,
    });
    const curr = adapter.getState('a1') as never;
    const full = adapter.renderState(null, curr);
    expect(full).toContain('<shell>');
    expect(full).toContain('Platform: darwin');
    expect(full).toContain('<shell-sessions>');
    expect(full).toContain('id="s1"');
    expect(full).toContain('cwd="/p"');
  });

  it('emits shell-session-started for new sessions', () => {
    const adapter = createShellsDomainAdapter({
      getSnapshot: () => ({
        sessions: [makeSession({ id: 's2', lineCount: 2 })],
      }),
      getShellInfo: () => SHELL_INFO,
    });
    const curr = adapter.getState('a1') as never;
    const prev = { shellInfo: SHELL_INFO, shells: { sessions: [] } } as never;
    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('shell-session-started');
    expect(diff).toContain('sessionId="s2"');
  });

  it('emits shell-session-exited when a session exits', () => {
    const adapter = createShellsDomainAdapter({
      getSnapshot: () => ({
        sessions: [makeSession({ exited: true, exitCode: 0 })],
      }),
      getShellInfo: () => SHELL_INFO,
    });
    const curr = adapter.getState('a1') as never;
    const prev = {
      shellInfo: SHELL_INFO,
      shells: { sessions: [makeSession({ exited: false })] },
    } as never;
    const diff = adapter.renderState(prev, curr);
    expect(diff).toContain('shell-session-exited');
    expect(diff).toContain('exitCode="0"');
  });

  it('escapes XML-significant characters in the <shell> text body', () => {
    const adapter = createShellsDomainAdapter({
      getSnapshot: () => ({ sessions: [] }),
      getShellInfo: () => ({
        platform: 'linux',
        type: 'bash',
        path: '/opt/sh<weird>&awful/bin/bash',
      }),
    });
    const curr = adapter.getState('a1') as never;
    const full = adapter.renderState(null, curr);
    expect(full).toContain(
      'Shell: bash (/opt/sh&lt;weird&gt;&amp;awful/bin/bash)',
    );
    expect(full).not.toContain('<weird>');
  });

  it('exposes a non-empty promptSection covering shell usage keywords', () => {
    const adapter = createShellsDomainAdapter({
      getSnapshot: () => ({ sessions: [] }),
      getShellInfo: () => SHELL_INFO,
    });
    expect(adapter.promptSection).toBeTruthy();
    const section = adapter.promptSection ?? '';
    expect(section).toContain('executeShellCommand');
    expect(section).toContain('wait_until');
  });
});
