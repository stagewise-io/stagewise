import * as vscode from 'vscode';

// Define the name for the diagnostic collection
const DIAGNOSTIC_COLLECTION_NAME = 'customPromptInjector';

export async function callCursorAgent(prompt: string): Promise<void> {
  console.error('>>> triggerAgentWithPrompt started'); // Use console.error for visibility

  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    console.error('>>> No active editor found, looking for existing file');
    try {
      // Get all workspace files
      const files = await vscode.workspace.findFiles(
        '**/*',
        '**/node_modules/**',
      );

      if (files.length === 0) {
        console.error('>>> No files found in workspace');
        vscode.window.showErrorMessage('No files found in workspace to open.');
        return;
      }

      // Open the first file found
      const document = await vscode.workspace.openTextDocument(files[0]);
      editor = await vscode.window.showTextDocument(document);
      console.error('>>> Opened existing file:', files[0].fsPath);
    } catch (error) {
      console.error('>>> Failed to open existing file:', error);
      vscode.window.showErrorMessage(
        'Failed to open existing file for prompt injection.',
      );
      return;
    }
  }

  const document = editor.document; // Get document early

  // --- Create the Diagnostic Collection ONCE before try/finally ---
  // This collection will be used to both set and clear the diagnostic.
  const fakeDiagCollection = vscode.languages.createDiagnosticCollection(
    DIAGNOSTIC_COLLECTION_NAME,
  );

  try {
    // Use a large range or the current selection - using full doc range here
    // Consider using editor.selection if you want it tied to selected code
    const selectionOrFullDocRange = editor.selection.isEmpty
      ? new vscode.Range(0, 0, document.lineCount, 0) // Fallback to full doc if no selection
      : editor.selection; // Use actual selection if available

    console.error(
      '>>> Using range:',
      `Start=[L${selectionOrFullDocRange.start.line},C${selectionOrFullDocRange.start.character}], End=[L${selectionOrFullDocRange.end.line},C${selectionOrFullDocRange.end.character}]`,
    );

    // 1. Create the fake diagnostic object
    const fakeDiagnostic = new vscode.Diagnostic(
      selectionOrFullDocRange,
      prompt,
      vscode.DiagnosticSeverity.Error,
    );
    fakeDiagnostic.source = 'CustomPromptInjector'; // Optional source identifier

    console.error('>>> Setting fake diagnostic:', fakeDiagnostic.message);
    // 2. Set the diagnostic using the collection created outside the try block
    fakeDiagCollection.set(document.uri, [fakeDiagnostic]);

    // 3. Ensure cursor is within the diagnostic range (e.g., start)
    // This might help with the '@composer.isCursorOnLint' context, but may not be sufficient
    editor.selection = new vscode.Selection(
      selectionOrFullDocRange.start,
      selectionOrFullDocRange.start,
    );

    // 5. Execute the command
    console.error('>>> Executing composer.fixerrormessage');
    await vscode.commands.executeCommand('composer.fixerrormessage');
    console.error('>>> composer.fixerrormessage command executed.');
    vscode.window.showInformationMessage(`Triggered agent for prompt.`); // Simplified message
  } catch (error) {
    console.error(`>>> Error during fake diagnostic/command execution:`, error);
    vscode.window.showErrorMessage(`Failed to inject prompt: ${error}`);
  } finally {
    // --- CRUCIAL: Use the SAME collection instance created ABOVE the try block ---
    console.error('>>> Entering finally block to clear diagnostic.');
    if (document) {
      // Check if document still valid (it should be)
      console.error(
        '>>> Clearing fake diagnostic from:',
        document.uri.toString(),
      );
      // Clear the specific diagnostic for this URI from the collection
      fakeDiagCollection.delete(document.uri);
      // Alternatively, clear all diagnostics managed by this collection:
      // fakeDiagCollection.clear();
    } else {
      console.error(
        '>>> Document not available in finally block, clearing all diagnostics from collection.',
      );
      fakeDiagCollection.clear(); // Clear everything if URI is lost
    }
    // --- Dispose the collection to clean up resources ---
    console.error('>>> Disposing diagnostic collection.');
    fakeDiagCollection.dispose();
  }
}
