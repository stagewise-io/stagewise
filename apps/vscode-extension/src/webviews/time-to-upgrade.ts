import * as vscode from 'vscode';
import { AnalyticsService, EventName } from 'src/services/analytics-service';
import { removeOldToolbarPrompt } from 'src/auto-prompts/remove-old-toolbar';
import type { StorageService } from 'src/services/storage-service';

export function createTimeToUpgradePanel(
  context: vscode.ExtensionContext,
  storage: StorageService,
  _onRemoveOldToolbar: () => Promise<void>,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'stagewiseTimeToUpgrade',
    'Time to upgrade',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  panel.webview.html = getWebviewContent(panel.webview, context);

  // Immediately mark as seen
  void storage.set('stagewise.hasSeenTimeToUpgrade', true);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'copyUninstallCommand':
          vscode.env.clipboard.writeText(removeOldToolbarPrompt);
          break;
        case 'openTerminal': {
          const terminal = vscode.window.createTerminal({
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          });
          terminal.show();
          terminal.sendText('npx stagewise@latest -b', false);
          break;
        }
        case 'openDiscord':
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case 'dismissPanel':
          AnalyticsService.getInstance().trackEvent(
            EventName.DISMISSED_TIME_TO_UPGRADE_PANEL,
          );
          panel.dispose();
          break;
      }
    },
    undefined,
    context.subscriptions,
  );

  return panel;
}

function getWebviewContent(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
): string {
  const stagewiseUrl =
    context.extensionMode === vscode.ExtensionMode.Development
      ? 'http://localhost:3000/vscode-extension/migrate-to-cli'
      : 'https://stagewise.io/vscode-extension/migrate-to-cli';

  const cspDomain =
    context.extensionMode === vscode.ExtensionMode.Development
      ? 'http://localhost:3000'
      : 'https://stagewise.io';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src ${webview.cspSource} ${cspDomain}; style-src ${webview.cspSource} 'unsafe-inline' ${cspDomain}; script-src ${webview.cspSource} 'unsafe-inline' ${cspDomain};">
    <title>Time to upgrade</title>
    <style>
        html, body {
            padding: 0;
            margin: 0;
            width: 100%;
            height: 100%;
            border: none;
            overflow: hidden;
            box-sizing: border-box;
        }
        #maincontent_iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: 0;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
    </style>
</head>
<body>
<iframe src="${stagewiseUrl}" id="maincontent_iframe"></iframe>
<script>
    // Get the VS Code API
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('maincontent_iframe');

    // Single event listener to handle messages from both VS Code and iframe
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('Received message:', message);

        // Handle messages from VS Code
        if (event.source === window) {
            iframe.contentWindow.postMessage(message, '*');
        }
        // Handle messages from iframe
        else {
            vscode.postMessage(message);
        }
    });
</script>
</body>
</html>`;
}

export async function shouldShowTimeToUpgrade(
  storage: StorageService,
): Promise<boolean> {
  // Show time to upgrade panel if the user hasn't seen it before
  return !(await storage.get('stagewise.hasSeenTimeToUpgrade', false));
}
