import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverSkills } from './skills';

const SKILL_MD = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nSkill body.\n`;

const fixtures: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `skills-test-${prefix}-`));
  fixtures.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe('discoverSkills', () => {
  it('discovers a regular skill directory', async () => {
    const skillsDir = await makeTempDir('regular');
    const skillDir = join(skillsDir, 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      SKILL_MD('my-skill', 'A test skill'),
    );

    const skills = await discoverSkills(skillsDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe('A test skill');
  });

  it('discovers a symlinked skill directory (regression test for #1373)', async () => {
    // The skills directory itself
    const skillsDir = await makeTempDir('symlink');
    // A *separate* directory tree that we will symlink into skillsDir
    const sourceRoot = await makeTempDir('symlink-src');
    const sourceSkill = join(sourceRoot, 'linked-skill');
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(
      join(sourceSkill, 'SKILL.md'),
      SKILL_MD('linked-skill', 'A symlinked skill'),
    );

    // Create the symlink: skillsDir/linked-skill -> sourceSkill
    await symlink(sourceSkill, join(skillsDir, 'linked-skill'));

    const skills = await discoverSkills(skillsDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('linked-skill');
    expect(skills[0].description).toBe('A symlinked skill');
  });

  it('skips entries without a SKILL.md', async () => {
    const skillsDir = await makeTempDir('no-skillmd');
    const skillDir = join(skillsDir, 'incomplete-skill');
    await mkdir(skillDir, { recursive: true });
    // No SKILL.md written

    const skills = await discoverSkills(skillsDir);
    expect(skills).toEqual([]);
  });

  it('skips entries with missing name or description in frontmatter', async () => {
    const skillsDir = await makeTempDir('bad-frontmatter');

    const noName = join(skillsDir, 'no-name');
    await mkdir(noName, { recursive: true });
    await writeFile(
      join(noName, 'SKILL.md'),
      `---\ndescription: desc only\n---\n`,
    );

    const noDesc = join(skillsDir, 'no-desc');
    await mkdir(noDesc, { recursive: true });
    await writeFile(join(noDesc, 'SKILL.md'), `---\nname: no-desc\n---\n`);

    const skills = await discoverSkills(skillsDir);
    expect(skills).toEqual([]);
  });

  it('skips regular files in the skills directory', async () => {
    const skillsDir = await makeTempDir('has-files');
    await writeFile(join(skillsDir, 'README.md'), 'not a skill');

    const skills = await discoverSkills(skillsDir);
    expect(skills).toEqual([]);
  });

  it('skips broken symlinks gracefully', async () => {
    const skillsDir = await makeTempDir('broken-symlink');
    // Symlink pointing to a path that does not exist
    await symlink(
      join(skillsDir, 'does-not-exist'),
      join(skillsDir, 'broken-link'),
    );

    // Should not throw and should return empty
    const skills = await discoverSkills(skillsDir);
    expect(skills).toEqual([]);
  });

  it('returns empty array for a non-existent directory', async () => {
    const skills = await discoverSkills(join(tmpdir(), 'no-such-dir-12345'));
    expect(skills).toEqual([]);
  });

  it('discovers both real and symlinked skills side by side', async () => {
    const skillsDir = await makeTempDir('mixed');
    const sourceRoot = await makeTempDir('mixed-src');

    // Real skill
    const realSkill = join(skillsDir, 'real-skill');
    await mkdir(realSkill, { recursive: true });
    await writeFile(
      join(realSkill, 'SKILL.md'),
      SKILL_MD('real-skill', 'Real'),
    );

    // Symlinked skill
    const srcSkill = join(sourceRoot, 'linked-skill');
    await mkdir(srcSkill, { recursive: true });
    await writeFile(
      join(srcSkill, 'SKILL.md'),
      SKILL_MD('linked-skill', 'Linked'),
    );
    await symlink(srcSkill, join(skillsDir, 'linked-skill'));

    const skills = await discoverSkills(skillsDir);
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['linked-skill', 'real-skill']);
  });
});
