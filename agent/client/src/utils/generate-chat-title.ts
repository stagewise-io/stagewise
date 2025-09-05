import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import { uiMessagesToModelMessages } from './ui-messages-to-model-messages.js';
import type { History } from '@stagewise/karton-contract';

export const generateChatTitleSystemPrompt = `
<system_prompt>
  <task>
    You are a helpful assistant that creates short, concise titles for newly created chats between a user and a frontend coding agent. 
  </task>
  <instructions>
    <instruction>Analyze the first message of the user in the chat to understand its core intent.</instruction>
    <instruction>Generate a chat title that summarizes this intent.</instruction>
  </instructions>
  <rules>
    <rule name="length">The title must be a maximum of 7 words.</rule>
    <rule name="format">Your response must consist ONLY of the generated title. Do not add any other text, explanation, or quotation marks.
    </rule>
  </rules>
  <example>
    <user_message>
      Add a new text input field for a user's middle name in the main registration form, right after the first name field.
    </user_message>
    <valid_output>
      Add Middle Name Field
    </valid_output>
  </example>
</system_prompt>
`;

export async function generateChatTitle(
  history: History,
  model: LanguageModel,
): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      messages: [
        {
          role: 'system',
          content: generateChatTitleSystemPrompt,
        },
        ...uiMessagesToModelMessages(history ?? []),
      ],
    });

    const titleSchema = z
      .string()
      .min(1)
      .max(50)
      .describe('The title of the chat');

    const cleanTitle = text
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();

    titleSchema.parse(cleanTitle);
    return cleanTitle;
  } catch (_) {
    const startTime = new Date();

    const fallbackTitle = `New Chat - ${startTime.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })}`;
    return fallbackTitle;
  }
}
