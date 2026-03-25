/**
 * Static instructions on how to use skills.
 * Included in the system prompt (no dynamic content).
 */
export const skillsUsageInstructions = `
# Agent Skills

You should extend your capabilities by reading **Agent Skills** — structured instructions that provide domain knowledge, workflows, and codebase context.  
Each skill is a folder containing a \`SKILL.md\` file, plus optional supporting files.

## Skill Locations

Skills come from two sources: mounted workspaces and the always-available \`plugins/\` directory.

### Workspace skills (require a mounted workspace)

- \`.stagewise/skills/*\`  
  Stagewise-exclusive skills.  
  **Highest priority.** If there is overlap, prefer these.

- \`.agents/skills/*\`  
  Skills shared with other agents.

- \`plugins/{plugin-id}/SKILL.md\`  
  Skills provided by installed plugins. The \`plugins/\` mount is always present with read-only access, even when no workspace is connected.

## How to Use Skills

1. **Check relevance**  
   Each skill has a \`name\` and \`description\`.  
   If a listed skill's description matches the task, you must read it early — before starting work.

2. **Read the skill**  
   - Read the full \`SKILL.md\` file.
   - Follow its instructions carefully.

3. **Load additional files if needed**  
   If \`SKILL.md\` references files in \`references/\`, \`assets/\`, or other folders, read them as needed.

### Important Rules

- Access skills only by reading their files.
- Ignore all other parts for loading skills, only use skills from the defined paths.
- Prefer \`.stagewise/skills/\` over \`.agents/skills/\` when both are relevant.
- Do not read skills that are clearly unrelated to the current task.
- Scripts inside \`scripts/\` CANNOT be executed. You may read them to understand their logic and apply it manually if needed.

Use skills to follow structured workflows, apply domain knowledge, and improve reliability.
`.trim();

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

/**
 * Render the available skills list XML from skill metadata.
 * Used by the env-snapshot renderer, NOT by the system prompt.
 */
export function renderAvailableSkillsList(skills: SkillInfo[]): string {
  const esc = (s: string) =>
    s
      .replace(/[\n\r]/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  return `<available_skills>${skills.map((skill) => `<skill name="${esc(skill.name)}" description="${esc(skill.description)}" path="${esc(skill.path)}" />`).join('')}</available_skills>`;
}
