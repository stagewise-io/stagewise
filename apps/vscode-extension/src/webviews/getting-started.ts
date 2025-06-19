import * as vscode from 'vscode';
import type { StorageService } from '../utils/storage-service';
import { AnalyticsService, EventName } from '../utils/analytics-service';

export function createGettingStartedPanel(
  context: vscode.ExtensionContext,
  storage: StorageService,
  onSetupToolbar: () => Promise<void>,
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'stagewiseGettingStarted',
    'Getting Started with stagewise',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  panel.webview.html = getWebviewContent(panel.webview, context);

  // Immediately mark as seen
  storage.set('stagewise.hasSeenGettingStarted', true);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'setupToolbar':
          try {
            AnalyticsService.getInstance().trackEvent(
              EventName.CLICKED_SETUP_TOOLBAR_IN_GETTING_STARTED_PANEL,
            );
            await onSetupToolbar();
          } catch (error) {
            // Show error message in webview
            panel.webview.postMessage({
              command: 'setupComplete',
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
            panel.reveal();
          }
          break;
        case 'openDocs':
          AnalyticsService.getInstance().trackEvent(
            EventName.CLICKED_OPEN_DOCS_IN_GETTING_STARTED_PANEL,
          );
          vscode.env.openExternal(
            vscode.Uri.parse(
              'https://stagewise.io/docs/quickstart#2-install-and-inject-the-toolbar',
            ),
          );
          panel.reveal();
          break;
        case 'captureFeedback':
          // Create posthog event
          AnalyticsService.getInstance().trackEvent(
            EventName.POST_SETUP_FEEDBACK,
            {
              type: message.data.type,
              text: message.data.text,
            },
          );
          break;
        case 'showRepo':
          vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/stagewise-io/stagewise'),
          );
          break;
        case 'dismissPanel':
          AnalyticsService.getInstance().trackEvent(
            EventName.DISMISSED_GETTING_STARTED_PANEL,
          );
          panel.dispose();
          break;
        case 'markGettingStartAsSeen':
          AnalyticsService.getInstance().trackEvent(
            EventName.INTERACTED_WITH_GETTING_STARTED_PANEL,
          );
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
      ? 'http://localhost:3000/vscode-extension/welcome'
      : 'https://stagewise.io/vscode-extension/welcome';

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
    <title>Getting Started with stagewise</title>
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

export async function shouldShowGettingStarted(
  storage: StorageService,
): Promise<boolean> {
  // Show getting started panel if the user hasn't seen it before
  return !(await storage.get('stagewise.hasSeenGettingStarted', false));
}
