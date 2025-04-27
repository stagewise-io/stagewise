// We have: toolUsage requests -> toolUsage responses
    // --> getConsoleLogs
    // --> getCurrentUrl
    // --> getAccessibilityStats (aria roles, alt text coverage, heading structure, tab order)
// We have: promptTrigger requests -> No response


// Type for pending requests
export type PendingRequest<T = any> = {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}; 

// Toolbar -> Extension
export type ToolRegistrationRequest = {
    type: 'tool_registration_request';
    id: string;
    payload: {
        toolName: string;
    }
}

// Extension -> toolbar
export type ToolUsageRequest<T = unknown> = {
    type: 'tool_usage_request';
    id: string;
    payload: {
        toolName: string;
        toolInput: T;
    }
}

// toolbar -> Extension
export type ToolUsageResponse<T = unknown> = {
    type: 'tool_usage_response';
    id: string;
    payload: {
        toolName: string;
        toolOutput: T;
    }
}

// toolbar -> Extension
export type PromptTriggerRequest = {
    type: 'prompt_trigger_request';
    id: string;
    payload: {
        prompt: string;
    }
}

// Extension -> toolbar
export type PromptTriggerResponse = {
    type: 'prompt_trigger_response';
    id: string;
    payload: {
        status: 'pending' | 'success' | 'error';
        progressText?: string;
    }
}

export type ServerResponse = {
    type: 'response';
    id: string;
    payload: any;
}

export type ServerErrorResponse = {
    type: 'errorResponse';
    id: string;
    error: string;
}

export type ServerAckMessage = {
    type: 'ack';
    id: string;
    success: boolean;
}

export type ServerInfoMessage = {
    type: 'info';
    message: string;
}

export type ServerGetRequest = {
    type: 'getRequest';
    id: string;
    command: string;
    payload: any;
}

export type ExtensionToToolbarMessage =
  | ToolUsageRequest
  | PromptTriggerResponse

export type ToolbarToExtensionMessage =
  | PromptTriggerRequest
  | ToolUsageResponse


export type ExtensionCommand = ExtensionToToolbarMessage['type'];
export type ToolbarCommand = ToolbarToExtensionMessage['type']; 

// Combined type for easier handling in generic message handlers
export type WebSocketMessage = 
  | ExtensionToToolbarMessage 
  | ToolbarToExtensionMessage

// Add this type mapping
export type CommandToPayloadMap = {
    'prompt_trigger_request': PromptTriggerRequest;
    'tool_usage_response': ToolUsageResponse;
    'tool_usage_request': ToolUsageRequest;
    'prompt_trigger_response': PromptTriggerResponse;
}