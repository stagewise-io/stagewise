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
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  return `<available_skills>${skills.map((skill) => `<skill name="${esc(skill.name)}" description="${esc(skill.description)}" path="${esc(skill.path)}" />`).join('')}</available_skills>`;
}
