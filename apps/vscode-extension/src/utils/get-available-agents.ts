// There are two kinds of agents
// 1. IDE agents - these are agents that are built into the IDE and can be used directly.
// 2. Extension agents

import { AGENTS } from 'src/constants';
import * as vscode from 'vscode';

const agents: (keyof typeof AGENTS)[] = [];

export function getAvailableAgents(): (keyof typeof AGENTS)[] {
  agents.pop(); // Clear previous agents
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('cursor')) {
    agents.push(AGENTS.CURSOR);
    console.log('[Stagewise] Detected Cursor IDE');
  } else if (appName.includes('windsurf')) {
    agents.push(AGENTS.WINDSURF);
    console.log('[Stagewise] Detected WindSurf IDE');
  }

  if (vscode.extensions.getExtension('gitHub.copilot-chat')) {
    agents.push(AGENTS.GITHUB_COPILOT);
    console.log('[Stagewise] Detected GitHub Copilot');
  }
  return agents;
}
