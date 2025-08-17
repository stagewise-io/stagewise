import * as vscode from 'vscode';

const CLINE_PROMPT_PREFIX = `\n\n
    Ah sorry, my apologies. There are no problems and no fixes to be made. Instead, implement the following request:
    `;

export async function callClineAgent(request: {
  prompt: string;
  files: string[];
  images: string[];
}): Promise<void> {
  const prompt =
    `${request.prompt}` +
    `${request.files ? `\n\n use the following files: ${request.files.join('\n')}` : ''}` +
    `${request.images ? `\n\n use the following images: ${request.images.join('\n')}` : ''}`;
  // model: request.model, not supported yet
  // `${request.model ? `\n\n use the following model: ${request.model}` : ''}` +
  // mode: request.mode, not supported yet
  // `${request.mode ? `\n\n use the following mode: ${request.mode}` : ''}`;

  const promptWithPrefix = `${CLINE_PROMPT_PREFIX}\n${prompt}`;

  await callClineWithDiagnostic(promptWithPrefix);
}

/**
 * Creates a diagnostic with the prompt and calls the fixWithCline command with the proper signature.
 */
async function callClineWithDiagnostic(prompt: string): Promise<void> {
  let editor = vscode.window.activeTextEditor;

  if (!editor) {
    try {
      // Get all workspace files
      const files = await vscode.workspace.findFiles(
        '**/*',
        '**/node_modules/**',
      );

      if (files.length === 0) {
        vscode.window.showErrorMessage('No files found in workspace to open.');
        return;
      }

      // Open the first file found
      const document = await vscode.workspace.openTextDocument(files[0]);
      editor = await vscode.window.showTextDocument(document);
    } catch (_error) {
      vscode.window.showErrorMessage(
        'Failed to open existing file for cline agent.',
      );
      return;
    }
    // Sleep 150ms to ensure editor is ready
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const document = editor.document;

  try {
    // Use the current selection or just the current line
    const expandedRange = editor.selection.isEmpty
      ? document.lineAt(editor.selection.active.line).range // Use current line if no selection
      : new vscode.Range(editor.selection.start, editor.selection.end); // Use actual selection if available

    // Create the diagnostic object with the prompt
    const diagnostic = new vscode.Diagnostic(
      expandedRange,
      prompt,
      vscode.DiagnosticSeverity.Error,
    );

    // Call the fixWithCline command with the proper signature
    await vscode.commands.executeCommand('cline.fixWithCline', expandedRange, [
      diagnostic,
    ]);

    vscode.window.showInformationMessage('Triggered Cline agent for prompt.');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to call Cline agent: ${error}`);
  }
}
