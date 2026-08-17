import { readFile, stat } from 'node:fs/promises';
import nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ContentBlock,
  PromptCapabilities,
} from '@agentclientprotocol/sdk';
import type { AgentMessage } from '@stagewise/agent-core/types';
import { resolveMountedPath } from './tool-mapper';

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
export const MAX_INLINE_IMAGE_BYTES = 20 * 1024 * 1024;

const STAGEWISE_AGENT_INSTRUCTIONS =
  '<stagewise-agent-instructions>\n' +
  'For structured user input, use the MCP tool ' +
  '`stagewise_request_user_input`. Do not use a provider-native question ' +
  'tool or ask the structured question in plain text. This tool is never ' +
  'used for command or tool approval: invoke the command or tool directly ' +
  'and let the host show its approval UI.\n' +
  '</stagewise-agent-instructions>';

export async function buildAcpPrompt(
  messages: Array<AgentMessage & { role: 'user' }>,
  mountedPaths: ReadonlyMap<string, string>,
  history: AgentMessage[],
  capabilities: PromptCapabilities = {},
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [
    { type: 'text', text: STAGEWISE_AGENT_INSTRUCTIONS },
  ];
  const currentMessageIds = new Set(messages.map((message) => message.id));
  let historyStart = 0;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.metadata?.compressedHistory !== undefined) {
      historyStart = index;
      break;
    }
  }
  const transcript = history
    .slice(historyStart)
    .flatMap((message, index) => {
      const summary =
        index === 0 ? message.metadata?.compressedHistory : undefined;
      if (currentMessageIds.has(message.id)) {
        return summary ? [`history-summary: ${summary}`] : [];
      }
      if (message.role !== 'user' && message.role !== 'assistant') return [];
      const text = message.parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
      return [
        ...(summary ? [`history-summary: ${summary}`] : []),
        ...(text ? [`${message.role}: ${text}`] : []),
      ];
    })
    .join('\n\n');
  if (transcript) {
    blocks.push({
      type: 'text',
      text: `<conversation-history>\n${transcript}\n</conversation-history>`,
    });
  }
  const texts = messages.flatMap((message) =>
    message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])),
  );
  blocks.push({ type: 'text', text: texts.join('\n\n') || 'Continue.' });
  for (const message of messages) {
    const metadata = message.metadata;
    if (metadata) {
      const context = {
        mentions: metadata.mentions,
        pathReferences: metadata.pathReferences,
        envState: metadata.envState,
        textClipAttachments: metadata.textClipAttachments,
      };
      if (Object.values(context).some((value) => value !== undefined)) {
        blocks.push({
          type: 'text',
          text: `<stagewise-context>\n${JSON.stringify(context)}\n</stagewise-context>`,
        });
      }
    }
    for (const attachment of message.metadata?.attachments ?? []) {
      const path = resolveMountedPath(attachment.path, mountedPaths);
      if (!path) continue;
      const extension = nodePath.extname(path).toLowerCase();
      const mimeType = IMAGE_MIME_TYPES[extension];
      try {
        const file = await stat(path);
        if (
          mimeType &&
          capabilities.image &&
          file.size <= MAX_INLINE_IMAGE_BYTES
        ) {
          const data = await readFile(path);
          blocks.push({
            type: 'image',
            data: data.toString('base64'),
            mimeType,
          });
        } else {
          blocks.push({
            type: 'resource_link',
            name: nodePath.basename(path),
            uri: pathToFileURL(path).href,
            size: file.size,
            ...(mimeType ? { mimeType } : {}),
          });
        }
      } catch {
        blocks.push({ type: 'text', text: `Attached local file: ${path}` });
      }
    }
  }
  return blocks;
}
