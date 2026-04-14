import type { FullEnvironmentSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { renderBrowserTabsXml, esc } from './browser-tabs-renderer';
import type { SkillInfo } from './skills';
import { PLANS_PREFIX } from '@shared/plan-ownership';
import { prefixLineNumbers } from '../../base-agent/file-read-transformer/format-utils';

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
  sections.push(renderBrowserTabsXml(browser));

  // All symlinks — user workspaces + always-available — in one table
  const { workspace } = snapshot;
  const systemPrefixes = new Set(['att', 'plugins', 'apps', 'shells']);
  const isSystemMount = (prefix: string) =>
    systemPrefixes.has(prefix) || prefix.startsWith('globalskills-');
  const userMounts = workspace.mounts.filter((m) => !isSystemMount(m.prefix));
  const systemMounts = workspace.mounts.filter((m) => isSystemMount(m.prefix));
  const allMounts = [...userMounts, ...systemMounts];

  if (allMounts.length > 0) {
    const rows = allMounts.map((m) => {
      const isUser = !isSystemMount(m.prefix);
      const addr = isUser ? `use '${m.prefix}/...' to address files` : '';
      const perms = m.permissions ? m.permissions.join(', ') : '';
      return `| ${m.prefix} | ${m.path} | ${addr} | ${perms} |`;
    });
    const table = [
      '| prefix | path | notes | permissions |',
      '|--------|------|-------|-------------|',
      ...rows,
    ].join('\n');
    sections.push(`<symlinks>\n${table}\n</symlinks>`);
  } else {
    sections.push('<symlinks>No symlinks available.</symlinks>');
  }

  // Shell environment
  if (shellInfo) {
    sections.push(
      `<shell>\nPlatform: ${process.platform}\nShell: ${shellInfo.type} (${shellInfo.path})\n</shell>`,
    );
  }

  // Available skills
  const { enabledSkills } = snapshot;
  if (enabledSkills.paths.length > 0) {
    const skillInfos: SkillInfo[] = enabledSkills.paths.map((p) => {
      const detail = skillDetails?.get(p);
      return detail ?? { name: p, description: '', path: p };
    });
    const skillFiles = skillInfos
      .map(
        (s) =>
          `<skill name="${esc(s.name)}" description="${esc(s.description)}" path="${esc(s.path)}" />`,
      )
      .join('\n');
    sections.push(`<available_skills>\n${skillFiles}\n</available_skills>`);
  }

  // AGENTS.md files
  const { agentsMd } = snapshot;
  const wsFileBlocks: string[] = [];
  if (agentsMd.entries.length > 0) {
    for (const entry of agentsMd.entries) {
      const respected = agentsMd.respectedMounts.includes(entry.mountPrefix);
      const body = prefixLineNumbers(entry.content);
      wsFileBlocks.push(
        `<file path="${esc(entry.mountPrefix)}/AGENTS.md" respected="${respected}">\n<metadata>language:markdown</metadata>\n<content>\n${body}\n</content>\n</file>`,
      );
    }
  }

  // WORKSPACE.md files
  const { workspaceMd } = snapshot;
  if (workspaceMd.entries.length > 0) {
    for (const entry of workspaceMd.entries) {
      const body = prefixLineNumbers(entry.content);
      wsFileBlocks.push(
        `<file path="${esc(entry.mountPrefix)}/.stagewise/WORKSPACE.md">\n<metadata>language:markdown</metadata>\n<content>\n${body}\n</content>\n</file>`,
      );
    }
  }

  if (wsFileBlocks.length > 0) {
    sections.push(wsFileBlocks.join('\n'));
  }

  // Active plans
  const { plans } = snapshot;
  if (plans.entries.length > 0) {
    const planLines = plans.entries.map((p) => {
      const progress = `${p.completedTasks}/${p.totalTasks}`;
      const file = `${PLANS_PREFIX}/${p.filename}`;
      const desc = p.description ? ` — ${p.description}` : '';

      // Find next unchecked task
      let nextTodo: string | null = null;
      for (const group of p.taskGroups) {
        for (const task of group.tasks) {
          if (!task.completed) {
            nextTodo = task.text;
            break;
          }
        }
        if (nextTodo) break;
      }

      const next = nextTodo
        ? `\n  Next TODO: ${nextTodo}`
        : '\n  All tasks complete.';
      return `- **${p.name}** (${progress})${desc}\n  File: \`${file}\`${next}`;
    });
    sections.push(`<active_plans>\n${planLines.join('\n')}\n</active_plans>`);
  }

  // Active app
  if (snapshot.activeApp) {
    sections.push(
      `<active_app id="${esc(snapshot.activeApp.appId)}"${snapshot.activeApp.pluginId ? ` plugin="${esc(snapshot.activeApp.pluginId)}"` : ''} />`,
    );
  }

  // Sandbox session
  if (snapshot.sandboxSessionId) {
    sections.push(`<sandbox session="${esc(snapshot.sandboxSessionId)}" />`);
  }

  return `<env-snapshot>\n${sections.join('\n\n')}\n</env-snapshot>`;
}
