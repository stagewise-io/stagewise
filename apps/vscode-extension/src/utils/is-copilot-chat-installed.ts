import * as vscode from 'vscode';

/**
 * Checks if the GitHub Copilot Chat extension is installed.
 * @returns True if the extension is installed, false otherwise.
 */
export function isCopilotChatInstalled(): boolean {
  const extensionId = 'gitHub.copilot-chat';
  const extension = vscode.extensions.getExtension(extensionId);
  return !!extension;
}
