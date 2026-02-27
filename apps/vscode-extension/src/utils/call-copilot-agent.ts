import * as vscode from 'vscode';

export async function callCopilotAgent(request: {
  prompt: string;
  files: string[];
  images: string[];
}): Promise<void> {
  const prompt = `${request.prompt}`;

  await vscode.commands.executeCommand('workbench.action.chat.openagent');
  await vscode.commands.executeCommand('workbench.action.chat.submit', {
    inputValue: prompt,
  });
}
