import { getCurrentIDE } from './get-current-ide';
import { callCursorAgent } from './call-cursor-agent';
import { isCopilotChatInstalled } from './is-copilot-chat-installed';
import { callCopilotAgent } from './call-copilot-agent';
import { callWindsurfAgent } from './call-windsurf-agent';
import * as vscode from 'vscode';
import type { PromptRequest } from '@stagewise/extension-toolbar-srpc-contract';

export async function dispatchAgentCall(request: PromptRequest) {
  // If a specific agent is requested, try to use it
  if (request.agent) {
    switch (request.agent) {
      case 'Cursor Agent':
        return await callCursorAgent(request);
      case 'Windsurf Agent':
        return await callWindsurfAgent(request);
      case 'GitHub Copilot':
        if (isCopilotChatInstalled()) {
          return await callCopilotAgent(request);
        } else {
          vscode.window.showErrorMessage(
            'GitHub Copilot Chat is not installed. Please install it from the marketplace.',
          );
          return;
        }
      default:
        vscode.window.showWarningMessage(
          `Unknown agent "${request.agent}". Falling back to IDE-based detection.`,
        );
    }
  }

  // Fallback to IDE-based detection if no agent specified or unknown agent
  const ide = getCurrentIDE();
  switch (ide) {
    case 'CURSOR':
      return await callCursorAgent(request);
    case 'WINDSURF':
      return await callWindsurfAgent(request);
    case 'VSCODE':
      if (isCopilotChatInstalled()) return await callCopilotAgent(request);
      else {
        vscode.window.showErrorMessage(
          'Currently, only Copilot Chat is supported for VSCode. Please install it from the marketplace to use stagewise with VSCode.',
        );
        break;
      }
    case 'UNKNOWN':
      vscode.window.showErrorMessage(
        'Failed to call agent: IDE is not supported',
      );
  }
}
