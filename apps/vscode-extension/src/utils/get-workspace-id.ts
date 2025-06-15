import * as vscode from 'vscode';

export async function getWorkspaceId(): Promise<string> {
  const workspaceRootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRootDir) {
    throw new Error('No workspace root directory found');
  }
  const hashedWorkspaceRootDir = await crypto.subtle
    .digest('SHA-1', new TextEncoder().encode(workspaceRootDir))
    .then((buffer) => {
      return Buffer.from(buffer).toString('hex');
    });
  return hashedWorkspaceRootDir;
}
