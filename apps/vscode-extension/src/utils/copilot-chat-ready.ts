import * as vscode from 'vscode';

/**
 * Checks if the GitHub Copilot Chat extension is installed.
 * @returns True if the extension is installed, false otherwise.
 */
export async function copilotChatReady(): Promise<boolean> {
  const extensionId = 'gitHub.copilot-chat';
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) {
    vscode.window.showErrorMessage(
      'GitHub Copilot Chat extension is not installed.',
    );
    vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      extensionId,
    );
    // Optionally, you can return false here or throw an error
    return false;
  }
  await extension?.activate();
  return true;
}
