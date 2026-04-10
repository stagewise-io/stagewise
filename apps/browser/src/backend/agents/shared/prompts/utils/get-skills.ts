import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import type { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import matter from 'gray-matter';

export interface Skill {
  name: string;
  description: string;
  path: string;
  /** Whether this skill appears in the slash-command popup. Defaults to `true`. */
  userInvocable: boolean;
  /** Whether this skill appears in the system prompt for the agent. Defaults to `true`. */
  agentInvocable: boolean;
}

export function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  userInvocable?: boolean;
  agentInvocable?: boolean;
} {
  try {
    const { data } = matter(content);
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      description:
        typeof data.description === 'string' ? data.description : undefined,
      userInvocable:
        typeof data['user-invocable'] === 'boolean'
          ? data['user-invocable']
          : undefined,
      agentInvocable:
        typeof data['agent-invocable'] === 'boolean'
          ? data['agent-invocable']
          : undefined,
    };
  } catch {
    return {};
  }
}

export async function discoverSkills(skillsDir: string): Promise<Skill[]> {
  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = resolve(skillsDir, entry.name);
    const skillMdPath = resolve(skillPath, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const content = await readFile(skillMdPath, 'utf-8');
    const meta = parseFrontmatter(content);
    if (!meta.name || !meta.description) continue;

    skills.push({
      name: meta.name,
      description: meta.description,
      path: skillPath,
      userInvocable: meta.userInvocable ?? true,
      agentInvocable: meta.agentInvocable ?? true,
    });
  }

  return skills;
}

/**
 * Discover user-level global skills from ~/.stagewise/skills/
 * and ~/.agents/skills/. Does not require a workspace runtime.
 * Deduplicates by name; .stagewise wins over .agents.
 */
export async function discoverGlobalSkills(): Promise<Skill[]> {
  const home = homedir();
  const stagewisePath = resolve(home, '.stagewise', 'skills');
  const agentsPath = resolve(home, '.agents', 'skills');

  const [stagewiseSkills, agentsSkills] = await Promise.all([
    discoverSkills(stagewisePath),
    discoverSkills(agentsPath),
  ]);

  stagewiseSkills.sort((a, b) => a.name.localeCompare(b.name));
  agentsSkills.sort((a, b) => a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const result: Skill[] = [];
  for (const skill of [...stagewiseSkills, ...agentsSkills]) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    result.push(skill);
  }
  return result;
}

export async function getSkills(
  clientRuntime: ClientRuntimeNode,
): Promise<Skill[]> {
  const cwd = clientRuntime.fileSystem.getCurrentWorkingDirectory();
  const stagewiseSkillsPath = resolve(cwd, '.stagewise', 'skills');
  const globalSkillsPath = resolve(cwd, '.agents', 'skills');

  const [stagewiseSkills, globalSkills] = await Promise.all([
    discoverSkills(stagewiseSkillsPath),
    discoverSkills(globalSkillsPath),
  ]);

  stagewiseSkills.sort((a, b) => a.name.localeCompare(b.name));
  globalSkills.sort((a, b) => a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const result: Skill[] = [];

  for (const skill of [...stagewiseSkills, ...globalSkills]) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    result.push(skill);
  }

  return result;
}
