// Type for pending requests
export type PendingRequest<T = any> = {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
};

// Add this type to distinguish between request and response messages
export type WebSocketMessageType = 'request' | 'response';

// Base type for all messages
export type BaseWebSocketMessage = {
  messageType: WebSocketMessageType;
  id: string;
};

// Extension -> toolbar
export type ToolUsageRequest<T = unknown> = BaseWebSocketMessage & {
  type: 'tool_usage_request';
  messageType: 'request';
  payload: {
    toolName: string;
    toolInput: T;
  };
};

// toolbar -> Extension
export type ToolUsageResponse<T = unknown> = BaseWebSocketMessage & {
  type: 'tool_usage_response';
  messageType: 'response';
  payload: {
    toolName: string;
    toolOutput: T;
  };
};

// toolbar -> Extension
export type PromptTriggerRequest = BaseWebSocketMessage & {
  type: 'prompt_trigger_request';
  messageType: 'request';
  payload: {
    prompt: string;
  };
};

// Extension -> toolbar
export type PromptTriggerResponse = BaseWebSocketMessage & {
  type: 'prompt_trigger_response';
  messageType: 'response';
  payload: {
    status: 'pending' | 'success' | 'error';
    progressText?: string;
  };
};

// Toolbar -> Extension
export type ToolRegistrationRequest = {
  type: 'tool_registration_request';
  id: string;
  payload: {
    toolName: string;
  };
};

export type ExtensionToToolbarMessage =
  | ToolUsageRequest
  | PromptTriggerResponse;

export type ToolbarToExtensionMessage =
  | PromptTriggerRequest
  | ToolUsageResponse;

export type ExtensionCommandType = ExtensionToToolbarMessage['type'];
export type ToolbarCommandType = ToolbarToExtensionMessage['type'];

// Combined type for easier handling in generic message handlers
export type WebSocketMessage =
  | ExtensionToToolbarMessage
  | ToolbarToExtensionMessage;

// Add this type mapping
export type CommandToPayloadMap = {
  prompt_trigger_request: PromptTriggerRequest;
  tool_usage_response: ToolUsageResponse;
  tool_usage_request: ToolUsageRequest;
  prompt_trigger_response: PromptTriggerResponse;
};
