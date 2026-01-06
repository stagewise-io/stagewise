// The prompt builder receives all required information about the app
// and then converts a set of UI messages to model messages that then can simply be used to trigger a LLM.

import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ChatMessage, KartonContract } from '@shared/karton-contracts/ui';
import { convertToModelMessages, type ModelMessage } from 'ai';
import { getSummarizationUserMessage } from './utils/summarize-chat-history';
import { getSystemPrompt } from './templates/system-prompt';
import { getUserMessage } from './templates/user';
import type { AggregatedDiagnostic } from '../../lsp';

/** Map of file paths to their LSP diagnostics */
export type DiagnosticsByFile = Map<string, AggregatedDiagnostic[]>;

// Number of user-assistant pairs to keep before the auto-compacting summary.
export const ORIGINAL_USER_MESSAGES_KEPT_WHEN_SUMMARIZING = 1;

type AutoCompactInfo = { index: number; summary: string };

/** Finds the latest user message with valid auto-compact info (scans in reverse). */
function findLatestAutoCompactMessage(
  chatMessages: ChatMessage[],
): AutoCompactInfo | null {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const message = chatMessages[i]!;
    if (message.role !== 'user') continue;

    const autoCompactInfo = message.metadata?.autoCompactInformation;
    if (
      autoCompactInfo?.isAutoCompacted === true &&
      autoCompactInfo.chatSummary &&
      autoCompactInfo.chatSummary.length > 0
    ) {
      return { index: i, summary: autoCompactInfo.chatSummary };
    }
  }
  return null;
}

/** Returns the end index (exclusive) of the first N user-assistant pairs. */
export function findEndOfFirstNPairs(
  chatMessages: ChatMessage[],
  pairsToKeep: number,
): number {
  let userMessageCount = 0;

  for (let i = 0; i < chatMessages.length; i++) {
    const message = chatMessages[i]!;
    if (message.role === 'user') {
      userMessageCount++;
      if (userMessageCount > pairsToKeep) return i;
    }
  }
  return chatMessages.length;
}

export class PromptBuilder {
  constructor(
    private readonly clientRuntime: ClientRuntime | null,
    private readonly getKartonState: () => KartonContract['state'],
    private readonly stagewiseMdPath: string | null,
  ) {}

  /**
   * Converts UI messages to model messages. If auto-compact info exists,
   * applies compaction: [first N pairs] + [summary] + [last pair].
   *
   * @param chatMessages - The chat messages to convert
   * @param lspDiagnosticsByFile - Map of file paths to their LSP diagnostics (from recently touched files)
   */
  public async convertUIToModelMessages(
    chatMessages: ChatMessage[],
    lspDiagnosticsByFile: DiagnosticsByFile = new Map(),
  ): Promise<ModelMessage[]> {
    // Get the system prompt and put that on the start
    // Always use current state via getter to avoid stale data
    const systemPrompt = await getSystemPrompt(
      this.getKartonState(),
      this.clientRuntime,
      this.stagewiseMdPath,
      lspDiagnosticsByFile,
    );
    const modelMessages: ModelMessage[] = [systemPrompt];

    const autoCompactInfo = findLatestAutoCompactMessage(chatMessages);

    if (autoCompactInfo) {
      this.convertWithAutoCompacting(
        chatMessages,
        autoCompactInfo,
        modelMessages,
      );
    } else {
      this.convertAllMessages(chatMessages, modelMessages);
    }

    return modelMessages;
  }

  /** Converts all messages without compaction. */
  private convertAllMessages(
    chatMessages: ChatMessage[],
    modelMessages: ModelMessage[],
  ): void {
    for (const message of chatMessages)
      this.convertSingleMessage(message, modelMessages);
  }

  /** Applies compaction: [first N pairs] + [summary] + [last pair with all following]. */
  private async convertWithAutoCompacting(
    chatMessages: ChatMessage[],
    autoCompactInfo: AutoCompactInfo,
    modelMessages: ModelMessage[],
  ): Promise<void> {
    const { index: autoCompactIndex, summary } = autoCompactInfo;

    // Find where the first N pairs end
    // This is the boundary between "kept" messages and "skipped" messages
    const endOfKeptPairs = findEndOfFirstNPairs(
      chatMessages,
      ORIGINAL_USER_MESSAGES_KEPT_WHEN_SUMMARIZING,
    );

    const keptMessagesEndIndex = Math.min(endOfKeptPairs, autoCompactIndex);

    // Add first N pairs
    for (let i = 0; i < keptMessagesEndIndex; i++)
      await this.convertSingleMessage(chatMessages[i]!, modelMessages);

    // Add summary (middle messages are skipped)
    modelMessages.push(getSummarizationUserMessage(summary));

    // Add last pair and any following messages
    for (let i = autoCompactIndex; i < chatMessages.length; i++)
      await this.convertSingleMessage(chatMessages[i]!, modelMessages);
  }

  /** Converts a single ChatMessage to ModelMessage(s). */
  private async convertSingleMessage(
    message: ChatMessage,
    modelMessages: ModelMessage[],
  ): Promise<void> {
    switch (message.role) {
      case 'user':
        modelMessages.push(await getUserMessage(message));
        break;
      case 'assistant': {
        // Skip empty reasoning/step-start messages
        if (
          message.parts.every(
            (part) => part.type === 'reasoning' || part.type === 'step-start',
          )
        )
          return;

        // Clean tool outputs (remove hiddenFromLLM fields)
        const cleanedMessage = {
          ...message,
          parts: message.parts.map((part) => {
            if (
              part.type === 'tool-deleteFileTool' ||
              part.type === 'tool-overwriteFileTool' ||
              part.type === 'tool-multiEditTool'
            ) {
              if (part.output) {
                if ('hiddenFromLLM' in part.output) {
                  const { hiddenFromLLM: _hiddenFromLLM, ...cleanOutput } =
                    part.output;
                  return {
                    ...part,
                    output: cleanOutput,
                  };
                } else {
                  return {
                    ...part,
                    output: part.output,
                  };
                }
              }
            }
            return part;
          }),
        };
        const convertedMessages = await convertToModelMessages([
          cleanedMessage,
        ]);
        const sanitizedConvertedMessages = convertedMessages.map((msg) =>
          sanitizeModelMessageToolCallInput(msg),
        );
        modelMessages.push(...sanitizedConvertedMessages);
        break;
      }
      default: {
        const convertedMessages = await convertToModelMessages([message]);
        modelMessages.push(...convertedMessages);
        break;
      }
    }
  }
}

function sanitizeModelMessageToolCallInput(
  message: ModelMessage,
): ModelMessage {
  if (typeof message.content === 'string') return message;
  if (message.role !== 'assistant') return message;

  return {
    ...message,
    content: message.content.map((part) => {
      if (part.type === 'tool-call' && typeof part.input === 'string') {
        return {
          ...part,
          input: JSON.parse(part.input),
        };
      }
      return part;
    }),
  };
}
