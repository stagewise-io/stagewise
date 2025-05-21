import { getCurrentIDE } from './get-current-ide';
import { callCursorAgent } from './call-cursor-agent';
import { callWindsurfAgent } from './call-windsurf-agent';
import * as vscode from 'vscode';
import type { PromptRequest } from '@stagewise/extension-toolbar-srpc-contract';

export async function dispatchAgentCall(request: PromptRequest) {
  const ide = getCurrentIDE();
  switch (ide) {
    case 'CURSOR':
      return await callCursorAgent(request);
    case 'WINDSURF':
      return await callWindsurfAgent(request);
    case 'VSCODE':
      vscode.window.showErrorMessage(
        'Currently, only Cursor and Windsurf are supported with stagewise.',
      );
      break;
    case 'UNKNOWN':
      vscode.window.showErrorMessage(
        'Failed to call agent: IDE is not supported',
      );
  }
}
