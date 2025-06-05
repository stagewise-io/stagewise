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
  context.subscriptions.push(regenerateCommand);
}
