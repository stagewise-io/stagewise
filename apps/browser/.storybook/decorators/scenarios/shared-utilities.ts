import type {
  AppState,
  TextUIPart,
  ReasoningUIPart,
  FileUIPart,
} from '@shared/karton-contracts/ui';
import {
  AgentTypes,
  type AgentMessage,
  type AgentToolUIPart,
  type AgentState,
} from '@shared/karton-contracts/ui/agent';
import type { ModelId } from '@shared/available-models';

/**
 * Type for an agent instance in the state
 */
export type AgentInstance = AppState['agents']['instances'][string];

/**
 * Generate a unique ID for messages and tool calls
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Realistic timing configurations
 */
export const REALISTIC_TIMING = {
  thinking: {
    min: 2000,
    max: 3000,
  },
  fileOperation: {
    min: 1000,
    max: 2000,
  },
  textStreaming: {
    intervalMs: 50, // ms per word
  },
  toolInputStreaming: {
    intervalMs: 30, // ms per char for tool inputs
  },
  phaseTransition: 300, // ms between tool state transitions
} as const;

/**
 * Get a random duration within a timing range
 */
export function getRandomDuration(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Split text into chunks based on the specified strategy
 */
export function splitIntoChunks(
  text: string,
  strategy: 'char' | 'word' | 'line' | 'sentence',
): string[] {
  switch (strategy) {
    case 'char':
      return text.split('');

    case 'word': {
      // Split by spaces but keep the spaces
      const words: string[] = [];
      let currentWord = '';
      for (const char of text) {
        currentWord += char;
        if (char === ' ' || char === '\n') {
          words.push(currentWord);
          currentWord = '';
        }
      }
      if (currentWord) words.push(currentWord);
      return words;
    }

    case 'line':
      // Split by newlines but keep them
      return text
        .split('\n')
        .flatMap((line, i, arr) =>
          i < arr.length - 1 ? [line, '\n'] : [line],
        );

    case 'sentence':
      // Split by sentence boundaries but keep punctuation
      return text.split(/(?<=[.!?])\s+/);

    default:
      return [text];
  }
}

/**
 * Set a nested field value in an object using dot notation
 * e.g., setNestedField({input: {content: 'old'}}, 'input.content', 'new')
 */
export function setNestedField(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const result = { ...obj };

  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    current[key] = { ...current[key] };
    current = current[key];
  }

  current[keys[keys.length - 1]!] = value;
  return result;
}

/**
 * Create a text part for a message
 */
export function createTextPart(text: string, state?: 'streaming'): TextUIPart {
  return {
    type: 'text',
    text,
    ...(state && { state }),
  } as TextUIPart;
}

/**
 * Create a reasoning/thinking part for a message
 */
export function createReasoningPart(
  text: string,
  state: 'streaming' | 'done' = 'done',
): ReasoningUIPart {
  return {
    type: 'reasoning',
    text,
    state,
  };
}

/**
 * Create a file attachment part
 */
export function createFilePart(
  filename: string,
  mediaType: string,
  url: string,
): FileUIPart {
  return {
    type: 'file',
    filename,
    mediaType,
    url,
  };
}

/**
 * Create a user message
 */
export function createUserMessage(
  text: string,
  options?: {
    id?: string;
    selectedElements?: any[];
    fileAttachments?: FileUIPart[];
  },
): AgentMessage {
  const parts = [...(options?.fileAttachments || []), createTextPart(text)];

  return {
    id: options?.id || generateId(),
    role: 'user',
    parts,
    metadata: {
      createdAt: new Date(),
      partsMetadata: [],
    },
  };
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(
  options: { id?: string; parts?: any[]; thinkingDuration?: number } = {},
): AgentMessage {
  return {
    id: options.id || generateId(),
    role: 'assistant',
    parts: options.parts || [],
    metadata: {
      createdAt: new Date(),
      partsMetadata: [],
      ...(options.thinkingDuration
        ? { thinkingDuration: options.thinkingDuration }
        : {}),
    },
  };
}

/**
 * Create an assistant message with text content (convenience wrapper)
 * This provides a simpler API for stories that just need text + optional tools
 */
export function createAssistantMessageWithText(
  text: string,
  options?: {
    id?: string;
    isStreaming?: boolean;
    toolParts?: any[];
    thinkingPart?: ReasoningUIPart;
    thinkingDuration?: number;
  },
): AgentMessage {
  const parts: any[] = [
    ...(options?.thinkingPart ? [options.thinkingPart] : []),
    ...(options?.toolParts || []),
    createTextPart(text, options?.isStreaming ? 'streaming' : undefined),
  ];

  return createAssistantMessage({
    id: options?.id,
    parts,
    thinkingDuration: options?.thinkingDuration,
  });
}

/**
 * Create a read tool part
 */
export function createReadToolPart(
  path: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-read',
      toolCallId,
      state: 'input-streaming',
      input: {
        path: path,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-read',
      toolCallId,
      state: 'input-available',
      input: {
        path: path,
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-read',
    toolCallId,
    state: 'output-available',
    input: {
      path: path,
    },
  } as unknown as AgentToolUIPart;
}

/**
 * Create a ls tool part
 */
export function createLsToolPart(
  path: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-ls',
      toolCallId,
      state: 'input-streaming',
      input: {
        path: path,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-ls',
      toolCallId,
      state: 'input-available',
      input: {
        path: path,
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-ls',
    toolCallId,
    state: 'output-available',
    input: {
      path: path,
    },
  } as unknown as AgentToolUIPart;
}

/**
 * Create an overwrite file tool part
 */
export function createWriteToolPart(
  path: string,
  content: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    oldContent?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();
  const beforeContent =
    options?.oldContent ||
    `// Old content of ${path}\nexport const OldComponent = () => null;`;

  if (state === 'input-streaming') {
    return {
      type: 'tool-write',
      toolCallId,
      state: 'input-streaming',
      input: {
        path: path,
        content,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-write',
      toolCallId,
      state: 'input-available',
      input: {
        path: path,
        content,
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-write',
    toolCallId,
    state: 'output-available',
    input: {
      path: path,
      content,
    },
    output: {
      message: 'File updated successfully',
      _diff: {
        before: beforeContent,
        after: content,
      },
      nonSerializableMetadata: {
        undoExecute: null,
      },
    },
  } as AgentToolUIPart;
}

/**
 * Create a multi-edit tool part
 */
export function createMultiEditToolPart(
  path: string,
  newContent: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    oldContent?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();
  const beforeContent =
    options?.oldContent ||
    `// Old content of ${path}\nexport const OldComponent = () => null;`;

  if (state === 'input-streaming') {
    return {
      type: 'tool-multiEdit',
      toolCallId,
      state: 'input-streaming',
      input: {
        path: path,
        edits: [{ old_string: beforeContent, new_string: newContent }],
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-multiEdit',
      toolCallId,
      state: 'input-available',
      input: {
        path: path,
        edits: [{ old_string: beforeContent, new_string: newContent }],
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-multiEdit',
    toolCallId,
    state: 'output-available',
    input: {
      path: path,
      edits: [{ old_string: beforeContent, new_string: newContent }],
    },
    output: {
      message: 'File edited successfully',
      result: {
        editsApplied: 1,
      },
      _diff: {
        before: beforeContent,
        after: newContent,
      },
      nonSerializableMetadata: {
        undoExecute: null,
      },
    },
  } as AgentToolUIPart;
}

/**
 * Create a mkdir tool part
 */
export function createMkdirToolPart(
  dirPath: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error' = 'output-available',
  options?: {
    toolCallId?: string;
    errorText?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-mkdir',
      toolCallId,
      state: 'input-streaming',
      input: { path: dirPath },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-mkdir',
      toolCallId,
      state: 'input-available',
      input: { path: dirPath },
    } as AgentToolUIPart;
  }

  if (state === 'output-error') {
    return {
      type: 'tool-mkdir',
      toolCallId,
      state: 'output-error',
      input: { path: dirPath },
      errorText:
        options?.errorText ??
        `A file already exists at ${dirPath}. Cannot create directory.`,
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-mkdir',
    toolCallId,
    state: 'output-available',
    input: { path: dirPath },
    output: {
      message: `Created directory: ${dirPath}`,
    },
  } as AgentToolUIPart;
}

/**
 * Create a copy/move tool part
 */
export function createCopyToolPart(
  inputPath: string,
  outputPath: string,
  move: boolean,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();
  const action = move ? 'Moved' : 'Copied';

  if (state === 'input-streaming') {
    return {
      type: 'tool-copy',
      toolCallId,
      state: 'input-streaming',
      input: {
        input_path: inputPath,
        output_path: outputPath,
        move,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-copy',
      toolCallId,
      state: 'input-available',
      input: {
        input_path: inputPath,
        output_path: outputPath,
        move,
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-copy',
    toolCallId,
    state: 'output-available',
    input: {
      input_path: inputPath,
      output_path: outputPath,
      move,
    },
    output: {
      message: `${action} file: ${inputPath} → ${outputPath}`,
    },
  } as AgentToolUIPart;
}

/**
 * Create a delete file tool part
 */
export function createDeleteFileToolPart(
  path: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    deletedContent?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();
  const fileContent =
    options?.deletedContent ||
    `// Content of ${path}\nexport const Component = () => null;`;

  if (state === 'input-streaming') {
    return {
      type: 'tool-delete',
      toolCallId,
      state: 'input-streaming',
      input: {
        path: path,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-delete',
      toolCallId,
      state: 'input-available',
      input: {
        path: path,
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-delete',
    toolCallId,
    state: 'output-available',
    input: {
      path: path,
    },
    output: {
      message: 'File deleted successfully',
      _diff: {
        before: fileContent,
        after: null, // null indicates file was deleted
      },
    },
  } as unknown as AgentToolUIPart;
}

/**
 * Create a glob tool part
 */
export function createGlobToolPart(
  pattern: string,
  totalMatches: number,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    path?: string;
    matchedPaths?: string[];
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-glob',
      toolCallId,
      state: 'input-streaming',
      input: {
        pattern,
        path: options?.path,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-glob',
      toolCallId,
      state: 'input-available',
      input: {
        pattern,
        mount_prefix: 'ws1',
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-glob',
    toolCallId,
    state: 'output-available',
    input: {
      pattern,
      mount_prefix: 'ws1',
    },
    output: {
      message: `Found ${totalMatches} files matching "${pattern}"`,
      result: {
        totalMatches,
        relativePaths: options?.matchedPaths || [],
        truncated: false,
        itemsRemoved: 0,
      },
    },
  } as AgentToolUIPart;
}

/**
 * Create a grep search tool part
 */
export function createGrepSearchToolPart(
  query: string,
  totalMatches: number,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    caseSensitive?: boolean;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-grepSearch',
      toolCallId,
      state: 'input-streaming',
      input: {
        query,
        max_matches: 100,
        case_sensitive: options?.caseSensitive ?? false,
      },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-grepSearch',
      toolCallId,
      state: 'input-available',
      input: {
        query,
        max_matches: 100,
        case_sensitive: options?.caseSensitive ?? false,
      },
    } as AgentToolUIPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-grepSearch',
    toolCallId,
    state: 'output-available',
    input: {
      mount_prefix: 'ws1',
      query,
      max_matches: 100,
      case_sensitive: options?.caseSensitive ?? false,
    },
    output: {
      message: `Found ${totalMatches} matches for "${query}"`,
      result: {
        totalMatches,
        matches: [],
        truncated: false,
      },
    },
  } as AgentToolUIPart;
}

/**
 * Create an execute sandbox JS tool part
 */
export function createExecuteSandboxJsToolPart(
  script: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error' = 'output-available',
  options?: {
    toolCallId?: string;
    result?: string;
    errorText?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-executeSandboxJs',
      toolCallId,
      state: 'input-streaming',
      input: { script },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-executeSandboxJs',
      toolCallId,
      state: 'input-available',
      input: { script },
    } as AgentToolUIPart;
  }

  if (state === 'output-error') {
    return {
      type: 'tool-executeSandboxJs',
      toolCallId,
      state: 'output-error',
      input: { script },
      errorText:
        options?.errorText ?? 'Error: Script execution failed unexpectedly',
    } as AgentToolUIPart;
  }

  return {
    type: 'tool-executeSandboxJs',
    toolCallId,
    state: 'output-available',
    input: { script },
    output: {
      message: 'Successfully executed sandbox JavaScript',
      result: { result: options?.result ?? '{}' },
    },
  } as AgentToolUIPart;
}

/**
 * Create an execute shell command tool part
 */
export function createExecuteShellCommandToolPart(
  command: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied' = 'output-available',
  options?: {
    toolCallId?: string;
    output?: string;
    stderr?: string;
    exit_code?: number | null;
    timed_out?: boolean;
    aborted?: boolean;
    errorText?: string;
    message?: string;
    approvalId?: string;
    approved?: boolean;
    approvalReason?: string;
  },
): AgentToolUIPart {
  const toolCallId = options?.toolCallId || generateId();
  const approvalId = options?.approvalId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-executeShellCommand',
      toolCallId,
      state: 'input-streaming',
      input: { command },
    } as AgentToolUIPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-executeShellCommand',
      toolCallId,
      state: 'input-available',
      input: { command },
    } as AgentToolUIPart;
  }

  if (state === 'approval-requested') {
    return {
      type: 'tool-executeShellCommand',
      toolCallId,
      state: 'approval-requested',
      input: { command },
      approval: { id: approvalId },
    } as AgentToolUIPart;
  }

  if (state === 'approval-responded') {
    return {
      type: 'tool-executeShellCommand',
      toolCallId,
      state: 'approval-responded',
      input: { command },
      approval: {
        id: approvalId,
        approved: options?.approved ?? true,
        reason: options?.approvalReason,
      },
    } as AgentToolUIPart;
  }

  if (state === 'output-denied') {
    return {
      type: 'tool-executeShellCommand',
      toolCallId,
      state: 'output-denied',
      input: { command },
      approval: {
        id: approvalId,
        approved: false,
        reason: options?.approvalReason ?? 'User denied',
      },
    } as AgentToolUIPart;
  }

  if (state === 'output-error') {
    return {
      type: 'tool-executeShellCommand',
      toolCallId,
      state: 'output-error',
      input: { command },
      errorText:
        options?.errorText ??
        'Shell service is not available — no shell detected.',
    } as AgentToolUIPart;
  }

  return {
    type: 'tool-executeShellCommand',
    toolCallId,
    state: 'output-available',
    input: { command },
    output: {
      message:
        options?.message ??
        `Command exited with code ${options?.exit_code ?? 0}`,
      output: options?.output ?? '',
      stderr: options?.stderr ?? '',
      exit_code: options?.exit_code ?? 0,
      timed_out: options?.timed_out ?? false,
      aborted: options?.aborted ?? false,
    },
  } as AgentToolUIPart;
}

// ============================================================================
// Agent Instance Helpers
// ============================================================================

/**
 * Default agent instance ID used for stories
 */
export const DEFAULT_STORY_AGENT_ID = 'story-agent-1';

/**
 * Generate a unique agent instance ID
 */
export function generateAgentInstanceId(): string {
  return `agent-${generateId()}`;
}

/**
 * Create an agent instance configuration for the state
 */
export function createAgentInstance(
  type: AgentTypes = AgentTypes.CHAT,
  options?: {
    title?: string;
    canSelectModel?: boolean;
    allowUserInput?: boolean;
    activeModelId?: ModelId;
    initialHistory?: AgentMessage[];
    isWorking?: boolean;
    inputState?: string;
  },
): AgentInstance {
  return {
    type,
    canSelectModel: options?.canSelectModel ?? true,
    requiredModelCapabilities: {
      inputModalities: {
        text: true,
        image: true,
        video: false,
        audio: false,
        file: true,
      },
      outputModalities: {
        text: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
      toolCalling: true,
    },
    allowUserInput: options?.allowUserInput ?? true,
    parentAgentInstanceId: null,
    state: {
      title: options?.title ?? 'Test Agent',
      isWorking: options?.isWorking ?? false,
      history: options?.initialHistory ?? [],
      queuedMessages: [],
      activeModelId: options?.activeModelId ?? 'claude-sonnet-4-6',
      inputState: options?.inputState ?? '',
      usedTokens: 0,
    },
  };
}

/**
 * Create initial state with a single agent instance
 */
export function createStateWithAgent(
  agentInstanceId: string,
  agentInstance: AgentInstance,
  additionalState?: Partial<AppState>,
): Partial<AppState> {
  return {
    ...additionalState,
    agents: {
      instances: {
        ...(additionalState?.agents?.instances ?? {}),
        [agentInstanceId]: agentInstance,
      },
    },
  };
}

/**
 * Create initial state with default agent (convenience function)
 */
export function createDefaultAgentState(
  options?: {
    initialHistory?: AgentMessage[];
    isWorking?: boolean;
    title?: string;
    activeModelId?: ModelId;
    canSelectModel?: boolean;
    allowUserInput?: boolean;
    inputState?: string;
  },
  additionalState?: Partial<AppState>,
): Partial<AppState> {
  return createStateWithAgent(
    DEFAULT_STORY_AGENT_ID,
    createAgentInstance(AgentTypes.CHAT, options),
    additionalState,
  );
}

// ============================================================================
// Agent State Manipulation Helpers
// ============================================================================

/**
 * Update a specific message in an agent's history
 */
export function updateMessageInAgentState(
  state: Partial<AppState>,
  agentInstanceId: string,
  messageId: string,
  updater: (message: AgentMessage) => AgentMessage,
): Partial<AppState> {
  const agentInstance = state.agents?.instances?.[agentInstanceId];
  if (!agentInstance) return state;

  const updatedHistory = agentInstance.state.history.map((msg) =>
    msg.id === messageId ? updater(msg) : msg,
  );

  return {
    ...state,
    agents: {
      ...state.agents,
      instances: {
        ...state.agents?.instances,
        [agentInstanceId]: {
          ...agentInstance,
          state: {
            ...agentInstance.state,
            history: updatedHistory,
          },
        },
      },
    },
  };
}

/**
 * Add a message to an agent's history
 */
export function addMessageToAgentState(
  state: Partial<AppState>,
  agentInstanceId: string,
  message: AgentMessage,
): Partial<AppState> {
  const agentInstance = state.agents?.instances?.[agentInstanceId];
  if (!agentInstance) return state;

  return {
    ...state,
    agents: {
      ...state.agents,
      instances: {
        ...state.agents?.instances,
        [agentInstanceId]: {
          ...agentInstance,
          state: {
            ...agentInstance.state,
            history: [...agentInstance.state.history, message],
          },
        },
      },
    },
  };
}

/**
 * Set the isWorking flag for an agent
 */
export function setAgentIsWorking(
  state: Partial<AppState>,
  agentInstanceId: string,
  isWorking: boolean,
): Partial<AppState> {
  const agentInstance = state.agents?.instances?.[agentInstanceId];
  if (!agentInstance) return state;

  return {
    ...state,
    agents: {
      ...state.agents,
      instances: {
        ...state.agents?.instances,
        [agentInstanceId]: {
          ...agentInstance,
          state: {
            ...agentInstance.state,
            isWorking,
          },
        },
      },
    },
  };
}

/**
 * Update the agent state with a recipe function (Immer-like pattern)
 */
export function updateAgentState(
  state: Partial<AppState>,
  agentInstanceId: string,
  updater: (agentState: AgentState) => Partial<AgentState>,
): Partial<AppState> {
  const agentInstance = state.agents?.instances?.[agentInstanceId];
  if (!agentInstance) return state;

  const updates = updater(agentInstance.state);

  return {
    ...state,
    agents: {
      ...state.agents,
      instances: {
        ...state.agents?.instances,
        [agentInstanceId]: {
          ...agentInstance,
          state: {
            ...agentInstance.state,
            ...updates,
          },
        },
      },
    },
  };
}

/**
 * Get the history from an agent instance in state
 */
export function getAgentHistory(
  state: Partial<AppState>,
  agentInstanceId: string,
): AgentMessage[] {
  return state.agents?.instances?.[agentInstanceId]?.state.history ?? [];
}

/**
 * Get the isWorking flag from an agent instance in state
 */
export function getAgentIsWorking(
  state: Partial<AppState>,
  agentInstanceId: string,
): boolean {
  return state.agents?.instances?.[agentInstanceId]?.state.isWorking ?? false;
}
