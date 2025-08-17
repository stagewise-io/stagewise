import * as vscode from 'vscode';

export async function callKilocodeAgent(request: {
  prompt: string;
  files: string[];
  images: string[];
}): Promise<void> {
  const prompt =
    `${request.prompt}` +
    `${request.files ? `\n\n use the following files: ${request.files.join('\n')}` : ''}` +
    `${request.images ? `\n\n use the following images: ${request.images.join('\n')}` : ''}`;
  // model: request.model, not supported yet
  // `${request.model ? `\n\n use the following model: ${request.model}` : ''}` +
  // mode: request.mode, not supported yet
  // `${request.mode ? `\n\n use the following mode: ${request.mode}` : ''}`;

  (await vscode.commands.executeCommand('kilo-code.newTask', {
    prompt,
  })) as Promise<any>;
}
