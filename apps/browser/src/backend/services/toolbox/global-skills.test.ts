import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  truncateSync: vi.fn(),
}));

// We test the pure helper functions that drive the global-skills
// filtering. Import from the lightweight module that has no heavy
// transitive dependencies (ToolboxService, mount-manager, etc.).
const { getGlobalSkillsMounts, getEnabledGlobalSkillsMounts } = await import(
  './global-skills'
);

describe('getGlobalSkillsMounts', () => {
  it('returns all 4 global skill directories', () => {
    const mounts = getGlobalSkillsMounts();
    expect(mounts).toHaveLength(4);
    const prefixes = mounts.map((m) => m.prefix);
    expect(prefixes).toContain('globalskills-sw');
    expect(prefixes).toContain('globalskills-agents');
    expect(prefixes).toContain('globalskills-codex');
    expect(prefixes).toContain('globalskills-claude');
  });

  it('resolves paths under the home directory', () => {
    const home = homedir();
    const mounts = getGlobalSkillsMounts();
    const codex = mounts.find((m) => m.prefix === 'globalskills-codex');
    const agents = mounts.find((m) => m.prefix === 'globalskills-agents');
    expect(codex?.absolutePath).toBe(path.resolve(home, '.codex', 'skills'));
    expect(agents?.absolutePath).toBe(path.resolve(home, '.agents'));
    expect(agents?.skillsPath).toBe(path.resolve(home, '.agents', 'skills'));
  });
});

describe('getEnabledGlobalSkillsMounts', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always includes stagewise and agents dirs regardless of preferences', () => {
    const mounts = getEnabledGlobalSkillsMounts([]);
    const prefixes = mounts.map((m) => m.prefix);
    expect(prefixes).toContain('globalskills-sw');
    expect(prefixes).toContain('globalskills-agents');
    expect(prefixes).not.toContain('globalskills-codex');
    expect(prefixes).not.toContain('globalskills-claude');
  });

  it('includes codex dir when opted in', () => {
    const mounts = getEnabledGlobalSkillsMounts(['globalskills-codex']);
    const prefixes = mounts.map((m) => m.prefix);
    expect(prefixes).toContain('globalskills-codex');
    expect(prefixes).not.toContain('globalskills-claude');
  });

  it('includes both codex and claude when both opted in', () => {
    const mounts = getEnabledGlobalSkillsMounts([
      'globalskills-codex',
      'globalskills-claude',
    ]);
    const prefixes = mounts.map((m) => m.prefix);
    expect(prefixes).toContain('globalskills-codex');
    expect(prefixes).toContain('globalskills-claude');
  });

  it('excludes dirs that do not exist on disk', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p);
      // Only stagewise exists; codex/claude/agents do not.
      return s.endsWith(path.join('.stagewise', 'skills'));
    });
    const mounts = getEnabledGlobalSkillsMounts([
      'globalskills-codex',
      'globalskills-claude',
    ]);
    const prefixes = mounts.map((m) => m.prefix);
    expect(prefixes).toContain('globalskills-sw');
    expect(prefixes).not.toContain('globalskills-agents');
    expect(prefixes).not.toContain('globalskills-codex');
    expect(prefixes).not.toContain('globalskills-claude');
  });

  it('ignores unknown prefixes in the enabled list', () => {
    const mounts = getEnabledGlobalSkillsMounts([
      'globalskills-unknown',
      'globalskills-codex',
    ]);
    const prefixes = mounts.map((m) => m.prefix);
    expect(prefixes).not.toContain('globalskills-unknown');
    expect(prefixes).toContain('globalskills-codex');
  });
});
