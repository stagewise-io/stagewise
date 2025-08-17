import * as vscode from 'vscode';

/**
 * Calls the Trae IDE agent with a formatted prompt.
 *
 * This function formats the request object into a single string prompt and
 * uses the command 'workbench.action.chat.icube.open' to send it to the
 * Trae IDE's chat interface.
 *
 *
 * @param request The prompt request containing the core prompt and context files.
 */
export async function callTraeAgent(request: {
  prompt: string;
  files: string[];
  images: string[];
}): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.icube.open', {
    query: request.prompt,
    newChat: true,
    keepOpen: true,
  });
}
