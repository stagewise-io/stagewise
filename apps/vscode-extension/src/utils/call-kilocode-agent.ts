import * as vscode from 'vscode';

export async function callKilocodeAgent(request: {
  prompt: string;
  files: string[];
  images: string[];
}): Promise<void> {
  const prompt = `${request.prompt}`;

  await vscode.commands.executeCommand('kilo-code.newTask', {
    prompt,
  });
}
