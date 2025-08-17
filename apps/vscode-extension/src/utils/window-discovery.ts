import * as vscode from 'vscode';
/**
 * Get detailed information about the current IDE window
 * This is used by the getSessionInfo RPC method
 */
export function getCurrentWindowInfo(port: number): {
  sessionId: string;
  appName: string;
  displayName: string;
  port: number;
} {
  return {
    sessionId: vscode.env.sessionId,
    appName: vscode.env.appName,
    displayName: `${vscode.workspace.name} (${vscode.env.appName})`,
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
