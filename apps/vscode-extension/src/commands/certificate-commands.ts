import * as vscode from 'vscode';
import { CertificateManager } from '../utils/certificate-manager';

export async function registerCertificateCommands(
  context: vscode.ExtensionContext,
) {
  const regenerateCommand = vscode.commands.registerCommand(
    'stagewise.regenerateCertificates',
    async () => {
      try {
        const certManager = new CertificateManager(context);

        // Show progress notification
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Regenerating HTTPS certificates...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 0,
              message: 'Generating new certificates',
            });

            await certManager.regenerateCertificates();

            progress.report({
              increment: 100,
              message: 'Certificates generated successfully',
            });
          },
        );

        // Show success message with restart information
        const restartAction = 'Restart Extension Host';
        const result = await vscode.window.showInformationMessage(
          'HTTPS certificates have been regenerated successfully. Please restart the extension host to apply the changes.',
          restartAction,
        );

        if (result === restartAction) {
          await vscode.commands.executeCommand(
            'workbench.action.restartExtensionHost',
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to regenerate certificates: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  const showInstructionsCommand = vscode.commands.registerCommand(
    'stagewise.showCertificateInstructions',
    async () => {
      const instructions = `
# HTTPS Certificate Trust Instructions

To use HTTPS with Stagewise, you need to trust the self-signed certificate in your browser:

## Chrome/Edge:
1. Go to https://localhost:[port] in your browser
2. Click "Advanced" when you see the security warning
3. Click "Proceed to localhost (unsafe)"
4. Alternatively, go to chrome://flags/#allow-insecure-localhost and enable it

## Firefox:
1. Go to https://localhost:[port] in your browser
2. Click "Advanced" when you see the security warning
3. Click "Accept the Risk and Continue"

## Safari:
1. Go to https://localhost:[port] in your browser
2. Click "Show Details" when you see the security warning
3. Click "visit this website"
4. Enter your password when prompted

## Security Note:
These certificates are only for local development and should never be used in production.

For more detailed instructions, visit: https://github.com/stagewise-io/stagewise/blob/main/docs/https-setup.md
      `.trim();

      // Create and show a new untitled document with the instructions
      const doc = await vscode.workspace.openTextDocument({
        content: instructions,
        language: 'markdown',
      });

      await vscode.window.showTextDocument(doc);
    },
  );

  context.subscriptions.push(regenerateCommand, showInstructionsCommand);
}

export async function showHttpsSetupGuidance(): Promise<void> {
  const config = vscode.workspace.getConfiguration('stagewise');
  const showGuidance = config.get<boolean>('server.showHttpsGuidance', true);

  if (!showGuidance) {
    return;
  }

  const learnMore = 'Learn More';
  const dontShowAgain = "Don't Show Again";

  const result = await vscode.window.showInformationMessage(
    'HTTPS server is now enabled. You may need to trust the self-signed certificate in your browser to access the toolbar from HTTPS websites.',
    learnMore,
    dontShowAgain,
  );

  if (result === learnMore) {
    await vscode.commands.executeCommand(
      'stagewise.showCertificateInstructions',
    );
  } else if (result === dontShowAgain) {
    await config.update(
      'server.showHttpsGuidance',
      false,
      vscode.ConfigurationTarget.Global,
    );
  }
}
