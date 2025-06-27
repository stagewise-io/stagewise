import * as vscode from 'vscode';
import { injectPromptDiagnosticWithCallback } from './inject-prompt-diagnostic-with-callback';
import type { PromptRequest } from '@stagewise/extension-toolbar-srpc-contract';

export async function callKilocodeAgent(request: PromptRequest): Promise<void> {
  const prompt =
    `${request.prompt}` +
    `${request.files ? `\n\n use the following files: ${request.files.join('\n')}` : ''}` +
    `${request.images ? `\n\n use the following images: ${request.images.join('\n')}` : ''}`;
  // model: request.model, not supported yet
  // `${request.model ? `\n\n use the following model: ${request.model}` : ''}` +
  // mode: request.mode, not supported yet
  // `${request.mode ? `\n\n use the following mode: ${request.mode}` : ''}`;

  await injectPromptDiagnosticWithCallback({
    prompt,
    callback: () =>
      vscode.commands.executeCommand('kilo-code.newTask') as Promise<any>,
  });
}