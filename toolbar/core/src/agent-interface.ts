export type SessionId = string;

export type Session = {
  id: SessionId;
  title: string;
  createdAt: Date;
};

export enum AgentAvailabilityError {
  NO_CONNECTION = 'no_connection',
  NO_AUTHENTICATION = 'no_authentication',
}

/** Information about the agent's availability.
 * The availability of other interfaces is only given, if the agent is available.
 * Other interface might throw an error if the agent is not available.
 */
export type AgentAvailabilityInfo =
  | {
      isAvailable: true;
    }
  | {
      isAvailable: false;
      error?: AgentAvailabilityError;
      errorMessage?: string;
    };

/** Information about a selected element */
type SelectedElement = {
  nodeType: string; // The type of the element
  xpath: string; // The XPath of the element
  attributes: Record<string, string>; // Shortened to max. 100 attributes
  textContent: string; // Shortened to max. 100 characters
  ownProperties: Record<string, unknown>; // Shortened to max. 100 properties. Only own properties are included. Objects are copied up to 2 levels deep.
  boundingClientRect: {
    top: number;
    left: number;
    height: number;
    width: number;
  };
  parent: SelectedElement | null; // Up to 10 layers of parent elements are included
  pluginInfo: {
    pluginName: string;
    content: string; // The additional information content of the plugin
  };
};

/** Fixed format metadata about the app state and the user */
type UserMessageMetadata = {
  currentUrl: string;
  currentTitle: string;
  currentZoomLevel: number;
  viewportResolution: {
    width: number;
    height: number;
  };
  devicePixelRatio: number;
  userAgent: string;
  userLanguage: string;
  selectedElements: SelectedElement[];
};

/** Content of a user message. */
export type UserMessageContentItem =
  | {
      // Regular text from the user
      type: 'text';
      text: string; // Text get's parsed as markdown
    }
  | {
      // Attached images for the prompt
      type: 'image';
      mimeType: string;
      data: string; // Base64 encoded image data
    }
  | {
      // Additional information collected by the toolbar
      type: 'custom_metadata';
      metadata: Record<string, string | number | boolean | object>;
    };

/** The wrapper for user generated messages. */
export type UserMessage = {
  id: string;
  contentItems: UserMessageContentItem[];
  createdAt: Date;
  metadata: UserMessageMetadata;
};

export type AgentMessageContentItemPart =
  | {
      // Regular response text from the agent
      type: 'text';
      text: string; // Text get's parsed as markdown
    }
  | {
      // Attached images for the response
      type: 'image';
      mimeType: string;
      data: string; // Base64 encoded image data
      replacing: boolean; // If true, the image will replace the previous version of the image. Otherwise, the data will be appended.
    };

export type AgentMessageUpdate = {
  messageId: string; //Make sure this stays consistent across all message parts for this message in order to properly concatenate the message parts
  updateParts: {
    contentIndex: number; // The index of the content item in the message. This is used to concatenate the message parts properly. Make sure that the part type is consistent across all parts.
    part: AgentMessageContentItemPart;
  }[];
  createdAt: Date;
  resync: boolean; // If true, the update will be handled like a full resync of the complete message. It will thus replace the complete previous message.
};

/** Interface that defines all required functions regarding messaging capabilities */
export interface MessagingCapabilities {
  /** Called when the user sends a message */
  onUserMessage: (message: string) => void;

  /** Called when the toolbar requests a full resync of the message (i.e. due to disconnect) */
  onResyncRequest: () => void;

  /** Called when the agent sends a message update */
  registerAgentMessageUpdateHandler: (
    handler: (update: AgentMessageUpdate) => void,
  ) => void;
}

/** This type defines all possible operational states that the agent might be in */
export type AgentState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting_for_tool_response'
  | 'waiting_for_user_response'
  | 'failed'
  | 'completed';

/**
 * The handler function for the state syncing capabilities.
 * @param state The current state of the agent.
 * @param summary A summary of the current state of the agent, giving a short hint on what happens...
 */
type AgentStateSyncHandler = (state: AgentState, summary: string) => void;

/** Interface that defines all required functions regarding state syncing capabilities */
export interface StateSyncCapabilities {
  /** Called when the toolbar requests a resync of the agent state (i.e. due to disconnect) */
  onResyncRequest: () => void;

  /** Called when the agent state changes */
  registerStateSyncHandler: (handler: AgentStateSyncHandler) => void;
}

type Tool = {
  /** The name of the tool */
  name: string;

  /** Short description of what the tool does */
  description: string;

  /** JSON Schema for the parameters */
  parametersSchema?: object;
};

type ToolCall = {
  /** The id of the tool call. This is used to identify the tool call and to match the response. */
  callId: string;

  /** The name of the tool to call */
  toolName: string;

  /** The arguments to pass to the tool */
  parameters?: object;
};

type ToolCallResponse = {
  callId: string;
} & (
  | {
      success: true;
      response?: unknown;
    }
  | {
      success: false;
      error: 'tool_not_available' | 'bad_parameter_format' | 'tool_failed';
      toolErrorMessage?: string;
    }
);

export interface ToolCallingCapabilities {
  /** Called when the toolbar tool list changes or the tool list has not yet been synced. */
  onToolListChange: (list: Tool[]) => void;

  /** Called when the agent calls a tool. All tools are handled asynchronously. */
  registerToolCallHandler: (
    handler: (toolCall: ToolCall) => Promise<ToolCallResponse>,
  ) => void;
}

/** FULL AGENT INTERFACE */
export interface AgentV1 {
  displayName: string;
  description: string;

  registerAgentAvailabilityHandler: (
    handler: (availability: AgentAvailabilityInfo) => void,
  ) => void;

  onAgentAvailabilitySyncRequest: () => Promise<AgentAvailabilityInfo>;

  /** MESSAGING CAPABILITIES. NO CHAT HISTORY ETC.. MESSAGING CAPABILITIES ARE MANADATORY. */
  messaging: MessagingCapabilities;

  /** AGENT STATE SYNCING CAPABILITIES. ONLY INCLUDES AGENT STATE SYNCING. AGENT STATE SYNCING IS MANADATORY. */
  stateSyncing: StateSyncCapabilities;

  /** TOOL CALLING CAPABILITIES. ONLY INCLUDES BUILT-IN TOOLS FROM TOOLBAR. NO MCP CALLS. TOOL CALLING CAPABILITIES ARE MANDATORY. */
  toolCalling: ToolCallingCapabilities;
}
