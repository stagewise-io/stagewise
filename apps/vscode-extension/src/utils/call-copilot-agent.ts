import type { PromptRequest } from '@stagewise/extension-toolbar-srpc-contract';
import { copilotChatReady } from './copilot-chat-ready';
import { commands } from 'vscode';

export async function callCopilotAgent(request: PromptRequest) {
  const prompt =
    `${request.prompt}` +
    `${request.files ? `\n\n use the following files: ${request.files.join('\n')}` : ''}` +
    `${request.images ? `\n\n use the following images: ${request.images.join('\n')}` : ''}`;

  if (await copilotChatReady()) {
    await commands.executeCommand('workbench.action.chat.openAgent');
    await commands.executeCommand('workbench.action.chat.sendToNewChat', {
      inputValue: prompt,
    });
  }
}
