import type { FullEnvironmentSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { renderBrowserTabsXml, esc } from './browser-tabs-renderer';
import { renderAvailableSkillsList } from './skills';
import type { SkillInfo } from './skills';

export interface ShellInfo {
  type: string;
  path: string;
}

/**
 * Renders a full environment rundown from a resolved snapshot.
 * Pure function — all data comes from the snapshot + supplementary params.
 *
 * @param snapshot - Fully resolved environment snapshot
 * @param shellInfo - Session-constant shell info (platform/shell)
 * @param skillDetails - Map of skill path -> {name, description} for rendering the skills list
 */
export function renderFullEnvironmentContext(
  snapshot: FullEnvironmentSnapshot,
  shellInfo?: ShellInfo | null,
  skillDetails?: Map<string, SkillInfo>,
): string {
  const sections: string[] = [];

  // Browser tabs
  const { browser } = snapshot;
  sections.push(`# Browser Tabs\n${renderBrowserTabsXml(browser)}`);

  // Mounted workspaces
  const { workspace } = snapshot;
  const userMounts = workspace.mounts.filter(
    (m) => !['att', 'plugins', 'apps'].includes(m.prefix),
  );
  const systemMounts = workspace.mounts.filter((m) =>
    ['att', 'plugins', 'apps'].includes(m.prefix),
  );

  if (userMounts.length > 0) {
    const mountLines = userMounts.map(
      (m) =>
        `- ${m.prefix}: ${m.path} (use '${m.prefix}/...' to address files)${m.permissions ? ` [${m.permissions.join(', ')}]` : ''}`,
    );
    sections.push(`# Mounted Workspaces\n${mountLines.join('\n')}`);
  } else {
    sections.push('# Mounted Workspaces\nNo workspaces connected.');
  }

  if (systemMounts.length > 0) {
    const sysLines = systemMounts.map(
      (m) =>
        `- ${m.prefix}/: ${m.path}${m.permissions ? ` [${m.permissions.join(', ')}]` : ''}`,
    );
    sections.push(`## Always-Available Mounts\n${sysLines.join('\n')}`);
  }

  // Shell environment
  if (shellInfo) {
    sections.push(
      `# Shell Environment\nPlatform: ${process.platform}\nShell: ${shellInfo.type} (${shellInfo.path})`,
    );
  }

  // Available skills
  const { enabledSkills } = snapshot;
  if (enabledSkills.paths.length > 0 && skillDetails) {
    const skillInfos: SkillInfo[] = enabledSkills.paths.map((p) => {
      const detail = skillDetails.get(p);
      return detail ?? { name: p, description: '', path: p };
    });
    sections.push(
      `# Available Skills\n${renderAvailableSkillsList(skillInfos)}`,
    );
  } else if (enabledSkills.paths.length > 0) {
    const pathList = enabledSkills.paths
      .map((p) => `  <skill path="${esc(p)}" />`)
      .join('\n');
    sections.push(
      `# Available Skills\n<available_skills>\n${pathList}\n</available_skills>`,
    );
  }

  // AGENTS.md files
  const { agentsMd } = snapshot;
  if (agentsMd.entries.length > 0) {
    const agentsFiles = agentsMd.entries.map((entry) => {
      const respected = agentsMd.respectedMounts.includes(entry.mountPrefix);
      return `<file path="${esc(entry.mountPrefix)}/AGENTS.md" respected="${respected}">${entry.content}</file>`;
    });
    sections.push(`# Workspace Files\n${agentsFiles.join('\n')}`);
  }

  // WORKSPACE.md files
  const { workspaceMd } = snapshot;
  if (workspaceMd.entries.length > 0) {
    const wsFiles = workspaceMd.entries.map(
      (entry) =>
        `<file path="${esc(entry.mountPrefix)}/.stagewise/WORKSPACE.md">${entry.content}</file>`,
    );
    if (agentsMd.entries.length === 0) {
      sections.push(`# Workspace Files\n${wsFiles.join('\n')}`);
    } else {
      sections.push(wsFiles.join('\n'));
    }
  }

  // Active app
  if (snapshot.activeApp) {
    sections.push(
      `# Active App\nApp: ${snapshot.activeApp.appId}${snapshot.activeApp.pluginId ? ` (plugin: ${snapshot.activeApp.pluginId})` : ''}`,
    );
  }

  // Sandbox session
  if (snapshot.sandboxSessionId) {
    sections.push(`# Sandbox\nSession: ${snapshot.sandboxSessionId}`);
  }

  return `<env-snapshot>\n${sections.join('\n\n')}\n</env-snapshot>`;
}
