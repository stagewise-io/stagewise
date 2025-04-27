import * as assert from 'assert';
import * as vscode from 'vscode';
import * as myExtension from '../extension';
import { describe, it, beforeAll } from 'vitest';

describe('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	// Ensure extension is activated before tests
	beforeAll(async () => {
		// The extension is activated the very first time the command is executed
		await vscode.extensions.getExtension('your-extension-id')?.activate();
	});

	it('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('your-extension-id'));
	});

	// Add tests for your specific commands
	it('Your command test', async () => {
		// Example test for a command
		await vscode.commands.executeCommand('your-command-id');
		// Add assertions here
	});
});
