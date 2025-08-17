import { AnalyticsService, EventName } from 'src/services/analytics-service';
import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import {
  AgentStateType,
  createAgentServer,
  type UserMessage,
  type AgentServer,
  type UserMessageContentItem,
  type SelectedElement,
} from '@stagewise/agent-interface/agent';
import * as vscode from 'vscode';

// Timeout constants for agent state transitions
const AGENT_COMPLETION_DELAY_MS = 1000;
const AGENT_IDLE_DELAY_MS = 5000;

export class AgentService {
  private static instance: AgentService;
  private analyticsService: AnalyticsService = AnalyticsService.getInstance();
  private server: AgentServer | null = null;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public shutdown() {
    this.server?.server.close();
    this.server?.wss.close();
    this.server = null;
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  public async initialize() {
    this.server = await createAgentServer();

    this.server.setAgentName(vscode.env.appName);
    this.server.setAgentDescription(
      vscode.workspace.name ?? 'No open workspace',
    );
    this.server.interface.availability.set(true);

    let timeoutHandler: NodeJS.Timeout | null = null;
    this.server.interface.messaging.addUserMessageListener((message) => {
      this.server?.interface.state.set(AgentStateType.WORKING);

      this.triggerAgentPrompt(message);

      if (timeoutHandler) {
        clearTimeout(timeoutHandler);
      }

      timeoutHandler = this.scheduleStateTransitions();
    });
  }

  private scheduleStateTransitions(): NodeJS.Timeout {
    return setTimeout(() => {
      this.server?.interface.state.set(
        AgentStateType.COMPLETED,
        'Prompt was added to the agents chatbox',
      );
      this.scheduleIdleTransition();
    }, AGENT_COMPLETION_DELAY_MS);
  }

  private scheduleIdleTransition(): void {
    setTimeout(() => {
      this.server?.interface.state.set(AgentStateType.IDLE);
    }, AGENT_IDLE_DELAY_MS);
  }

  private async triggerAgentPrompt(userMessage: UserMessage) {
    // Create the nice prompt that we need
    this.analyticsService.trackEvent(EventName.AGENT_PROMPT_TRIGGERED);

    const request = {
      prompt: createPrompt(userMessage),
      files: [],
      images: [],
    };

    await dispatchAgentCall(request);
  }
}

/**
 * Generates a detailed context string for a single HTMLElement.
 */
function generateElementContext(element: SelectedElement): string {
  const nodeType = `<node_type>${element.nodeType}</node_type>`;

  const attributes = `
<attributes>
${Object.entries(element.attributes)
  .map(([key, value]) => `<${key}>${value}</${key}>`)
  .join('\n')}
</attributes>`.trim();

  const properties = `
<properties>
${Object.entries(element.ownProperties)
  .map(([key, value]) => `<${key}>${JSON.stringify(value)}</${key}>`)
  .join('\n')}
</properties>`.trim();

  const boundingClientRect = `<bounding_client_rect>
  <width>${element.boundingClientRect.width}</width>
  <height>${element.boundingClientRect.height}</height>
  <top>${element.boundingClientRect.top}</top>
  <left>${element.boundingClientRect.left}</left>
  </bounding_client_rect>`;

  const textContent = `<text_content>
  ${element.textContent}
  </text_content>`;

  const pluginInfo = `<plugin_info>
  ${element.pluginInfo.map((plugin) => `<${plugin.pluginName}>${plugin.content}</${plugin.pluginName}>`).join('\n')}
  </plugin_info>`;

  const xpath = `<xpath>${element.xpath}</xpath>`;

  const parent = element.parent
    ? `<parent>${generateElementContext(element.parent)}</parent>`
    : '';

  return `
  ${nodeType}
  ${attributes}
  ${properties}
  ${boundingClientRect}
  ${textContent}
  ${pluginInfo}
  ${xpath}
  ${parent}
  `;
}

/**
 * Creates a comprehensive prompt for a Coding Agent LLM.
 *
 * @param selectedElements - An array of HTMLElements the user interacted with.
 * @param userPrompt - The user's natural language instruction.
 * @param url - The URL of the page where the interaction occurred.
 * @param contextSnippets - An array of context snippets from a list of plugins.
 * @returns A formatted string prompt for the LLM.
 */
export function createPrompt(msg: UserMessage): string {
  const pluginContext = Object.entries(msg.pluginContent)
    .map(
      ([pluginName, snippets]) =>
        [
          pluginName,
          Object.entries(snippets).filter(
            ([_, snippet]) => snippet.type === 'text',
          ),
        ] as [string, [string, UserMessageContentItem][]],
    )
    .filter(([_, snippets]) => snippets.length > 0)
    .map(([pluginName, snippets]) => {
      return `
<plugin_contexts>
<${pluginName}>
${snippets.map((snippet) => `<${snippet[0]}>${(snippet[1] as { type: 'text'; text: string }).text}</${snippet[0]}>`).join('\n')}
</${pluginName}>
</plugin_contexts>
`.trim();
    })
    .join('\n');

  const userMessage = msg.contentItems
    .filter((item) => item.type === 'text')
    .map((item) => (item as { type: 'text'; text: string }).text)
    .join('\n\n');

  return `
<request>
<user_message>${userMessage}</user_message>
  <url>${msg.metadata.currentUrl}</url>
  <pageTitle>${msg.metadata.currentTitle}</pageTitle>
  <browser_locale>${msg.metadata.locale}</browser_locale>
  <user_agent>${msg.metadata.userAgent}</user_agent>
  ${
    msg.metadata.selectedElements.length > 0
      ? `<selected_elements>
    ${msg.metadata.selectedElements.map((element, index) => `<element_${index}>${generateElementContext(element)}</element_${index}>`).join('\n')}
  </selected_elements>`
      : ''
  }
  ${pluginContext}
</request>`.trim();
}
