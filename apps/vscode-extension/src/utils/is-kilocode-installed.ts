import * as vscode from 'vscode';

/**
 * Checks if the Kilo Code extension is installed.
 * @returns True if the extension is installed, false otherwise.
 */
export function isKilocodeInstalled(): boolean {
  const extensionId = 'kilocode.kilo-code';
  const extension = vscode.extensions.getExtension(extensionId);
  return !!extension;
}