import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { describe, it, beforeAll } from 'vitest';

const EXTENSION_ID = 'your-extension-id';

describe('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  // Ensure extension is activated before tests
  beforeAll(async () => {
    // The extension is activated the very first time the command is executed
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
  });

  it('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension(EXTENSION_ID));
  });

  // Add tests for your specific commands
  it('Your command test', async () => {
    // Example test for a command
    // await vscode.commands.executeCommand('your-command-id');
    // Add assertions here
  });
});
