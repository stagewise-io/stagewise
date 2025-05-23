import * as vscode from 'vscode';

/**
 * Get detailed information about the current VS Code window
 * This is used by the getSessionInfo RPC method
 */
export function getCurrentWindowInfo(port: number) {
  return {
    sessionId: vscode.env.sessionId,
    workspaceName: vscode.workspace.name ?? null,
    workspaceFolders:
      vscode.workspace.workspaceFolders?.map((f) => f.name) ?? [],
    activeFile: vscode.window.activeTextEditor?.document.fileName ?? null,
    appName: vscode.env.appName,
    windowFocused: vscode.window.state.focused,
    displayName: vscode.env.appName,
    port,
  };
}

/**
 * Get a short identifier for the current window (useful for logging)
 */
export function getWindowShortId(): string {
  const workspaceName = vscode.workspace.name;
  const sessionId = vscode.env.sessionId.substring(0, 8);

  if (workspaceName) {
    return `${workspaceName}-${sessionId}`;
  }

  return `session-${sessionId}`;
}
