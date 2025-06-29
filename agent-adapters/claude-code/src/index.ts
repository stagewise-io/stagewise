import type { AgentInterfaceImplementation } from '@stagewise/agent-interface/agent';
import type { UserMessage } from '@stagewise/agent-interface/toolbar';
import { query } from '@anthropic-ai/claude-code';
import { EventEmitter } from 'node:events';
import { generateElementContext } from './utils/element-context.js';

function getAppendedSystemPrompt(message: UserMessage) {
  const intro =
    'The user is developing a web application and has a specific change request you should implement quickly. \nYour focus is to implement the change request in the most efficient way possible without asking for additional information.';

  const metadataContext = Object.entries(message.metadata)
    .map(([key, value]) => {
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join('\n');

  const metadataContextSnippet = `Metadata for the current user message: ${metadataContext}`;

  const elementContext = message.metadata.selectedElements.map((element) =>
    generateElementContext(element, 0),
  );

  const elementContextSnippet = `The user has selected the following elements: ${elementContext.join('\n')}`;

  return `${intro}\n\n${metadataContextSnippet}\n\n${elementContextSnippet}`;
}

type UnwrapAsyncIterable<T> = T extends AsyncIterable<infer U> ? U : never;

type EventTypes = {
  message: UnwrapAsyncIterable<
    ReturnType<AgentInterfaceImplementation['messaging']['getMessage']>
  >[];
};

export class ClaudeCodeAdapter implements AgentInterfaceImplementation {
  public messaging: AgentInterfaceImplementation['messaging'];
  public availability: AgentInterfaceImplementation['availability'];
  public state: AgentInterfaceImplementation['state'];
  private events: EventEmitter<EventTypes> = new EventEmitter();

  constructor() {
    const self = this;
    this.messaging = {
      getMessage: async function* () {
        while (true) {
          yield new Promise<EventTypes['message'][number]>((resolve) => {
            self.events.once('message', resolve);
          });
        }
      },
      onUserMessage: (message: UserMessage) => {
        this.queryClaude(message);
      },
    };
    this.availability = {
      getAvailability: async function* () {},
    };
    this.state = {
      getState: async function* () {},
    };
  }

  private async queryClaude(message: UserMessage) {
    const messageText = message.contentItems
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('');

    const appendedSystemPrompt = getAppendedSystemPrompt(message);

    for await (const msg of query({
      prompt: messageText,
      options: {
        appendSystemPrompt: appendedSystemPrompt,
      },
    })) {
      if (msg.type === 'assistant') {
        this.events.emit('message', {
          messageId: msg.message.id,
          updateParts: msg.message.content.map((c: any) => ({
            contentIndex: 0,
            part: c,
          })),
          createdAt: new Date(),
          resync: false,
        });
      }
    }
  }
}
