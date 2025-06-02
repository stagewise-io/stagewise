// There are two kinds of agents
// 1. IDE agents - these are agents that are built into the IDE and can be used directly.
// 2. Extension agents

import { AGENTS } from 'src/constants';
import * as vscode from 'vscode';

const agents: string[] = [];

export function getAgents() {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes('cursor')) {
    agents.push(AGENTS.CURSOR);
  } else if (appName.includes('windsurf')) {
    agents.push(AGENTS.WINDSURF);
  }

  if (vscode.extensions.getExtension('gitHub.copilot-chat')) {
    agents.push(AGENTS.GITHUB_COPILOT);
  }
}
