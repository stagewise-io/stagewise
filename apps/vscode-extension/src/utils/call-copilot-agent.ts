import * as vscode from 'vscode';

export async function callCopilotAgent(prompt: string): Promise<void> {
  return await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: prompt,
    previousRequests: [],
  });
}
