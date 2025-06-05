// There are two kinds of agents
// 1. IDE agents - these are agents that are built into the IDE and can be used directly.
// 2. Extension agents

import { AGENTS } from 'src/constants';
import * as vscode from 'vscode';

// Agent display names mapping
const AGENT_DISPLAY_NAMES = {
  [AGENTS.CURSOR]: 'Cursor Agent',
  [AGENTS.WINDSURF]: 'Windsurf Agent',
  [AGENTS.GITHUB_COPILOT]: 'GitHub Copilot',
} as const;

export function getAvailableAgents(): string[] {
  const agents: string[] = [];

  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('cursor')) {
    agents.push(AGENT_DISPLAY_NAMES[AGENTS.CURSOR]);
    console.log('[Stagewise] Detected Cursor IDE');
  } else if (appName.includes('windsurf')) {
    agents.push(AGENT_DISPLAY_NAMES[AGENTS.WINDSURF]);
    console.log('[Stagewise] Detected WindSurf IDE');
  }

  if (vscode.extensions.getExtension('gitHub.copilot-chat')) {
    agents.push(AGENT_DISPLAY_NAMES[AGENTS.GITHUB_COPILOT]);
    console.log('[Stagewise] Detected GitHub Copilot');
  }

  return agents;
}
