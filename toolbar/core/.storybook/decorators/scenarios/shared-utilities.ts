import type {
  AppState,
  ChatMessage,
  TextUIPart,
  ReasoningUIPart,
  ToolPart,
  FileUIPart,
} from '@stagewise/karton-contract';

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
): ChatMessage {
  const parts = [...(options?.fileAttachments || []), createTextPart(text)];

  return {
    id: options?.id || generateId(),
    role: 'user',
    parts,
    metadata: {
      createdAt: new Date(),
      selectedPreviewElements: options?.selectedElements || [],
    },
  };
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(
  options: { id?: string; parts?: any[]; thinkingDuration?: number } = {},
): ChatMessage {
  return {
    id: options.id || generateId(),
    role: 'assistant',
    parts: options.parts || [],
    metadata: {
      createdAt: new Date(),
      ...(options.thinkingDuration
        ? { thinkingDuration: options.thinkingDuration }
        : {}),
    },
  };
}

/**
 * Create a read file tool part
 */
export function createReadFileToolPart(
  relativePath: string,
  content: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    explanation?: string;
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-readFileTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        explanation: options?.explanation || 'Reading file',
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-readFileTool',
      toolCallId,
      state: 'input-available',
      input: {
        relative_path: relativePath,
        explanation: options?.explanation || 'Reading file',
      },
    } as ToolPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-readFileTool',
    toolCallId,
    state: 'output-available',
    input: {
      relative_path: relativePath,
      explanation: options?.explanation || 'Reading file',
    },
    output: {
      success: true,
      message: 'File read successfully',
      result: {
        content,
        totalLines: content.split('\n').length,
        linesRead: content.split('\n').length,
        truncated: false,
        originalSize: content.length,
        cappedSize: content.length,
      },
    },
  } as ToolPart;
}

/**
 * Create an overwrite file tool part
 */
export function createOverwriteFileToolPart(
  relativePath: string,
  content: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    oldContent?: string;
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();
  const beforeContent =
    options?.oldContent ||
    `// Old content of ${relativePath}\nexport const OldComponent = () => null;`;

  if (state === 'input-streaming') {
    return {
      type: 'tool-overwriteFileTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        content,
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-overwriteFileTool',
      toolCallId,
      state: 'input-available',
      input: {
        relative_path: relativePath,
        content,
      },
    } as ToolPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-overwriteFileTool',
    toolCallId,
    state: 'output-available',
    input: {
      relative_path: relativePath,
      content,
    },
    output: {
      message: 'File updated successfully',
      hiddenMetadata: {
        diff: {
          path: relativePath,
          before: beforeContent,
          after: content,
        },
        undoExecute: null,
      },
    },
  } as ToolPart;
}

/**
 * Create a multi-edit tool part
 */
export function createMultiEditToolPart(
  relativePath: string,
  newContent: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    oldContent?: string;
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();
  const beforeContent =
    options?.oldContent ||
    `// Old content of ${relativePath}\nexport const OldComponent = () => null;`;

  if (state === 'input-streaming') {
    return {
      type: 'tool-multiEditTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        edits: [{ old_string: beforeContent, new_string: newContent }],
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-multiEditTool',
      toolCallId,
      state: 'input-available',
      input: {
        relative_path: relativePath,
        edits: [{ old_string: beforeContent, new_string: newContent }],
      },
    } as ToolPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-multiEditTool',
    toolCallId,
    state: 'output-available',
    input: {
      relative_path: relativePath,
      edits: [{ old_string: beforeContent, new_string: newContent }],
    },
    output: {
      message: 'File edited successfully',
      result: {
        editsApplied: 1,
      },
      hiddenMetadata: {
        diff: {
          path: relativePath,
          before: beforeContent,
          after: newContent,
        },
        undoExecute: null,
      },
    },
  } as ToolPart;
}

/**
 * Create a delete file tool part
 */
export function createDeleteFileToolPart(
  relativePath: string,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    deletedContent?: string;
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();
  const fileContent =
    options?.deletedContent ||
    `// Content of ${relativePath}\nexport const Component = () => null;`;

  if (state === 'input-streaming') {
    return {
      type: 'tool-deleteFileTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-deleteFileTool',
      toolCallId,
      state: 'input-available',
      input: {
        relative_path: relativePath,
      },
    } as ToolPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-deleteFileTool',
    toolCallId,
    state: 'output-available',
    input: {
      relative_path: relativePath,
    },
    output: {
      message: 'File deleted successfully',
      hiddenMetadata: {
        undoExecute: null,
        diff: {
          path: relativePath,
          before: fileContent,
          after: '',
        },
      },
    },
  } as ToolPart;
}

/**
 * Create a list files tool part
 */
export function createListFilesToolPart(
  relativePath: string,
  files: Array<{
    relativePath: string;
    name: string;
    type: 'file' | 'directory';
    size?: number;
    depth: number;
  }>,
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available' = 'output-available',
  options?: {
    toolCallId?: string;
    recursive?: boolean;
    pattern?: string;
    maxDepth?: number;
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();
  const totalFiles = files.filter((f) => f.type === 'file').length;
  const totalDirectories = files.filter((f) => f.type === 'directory').length;

  if (state === 'input-streaming') {
    return {
      type: 'tool-listFilesTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        recursive: options?.recursive ?? false,
        pattern: options?.pattern,
        maxDepth: options?.maxDepth,
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-listFilesTool',
      toolCallId,
      state: 'input-available',
      input: {
        relative_path: relativePath,
        recursive: options?.recursive ?? false,
        pattern: options?.pattern,
        maxDepth: options?.maxDepth,
      },
    } as ToolPart;
  }

  // state === 'output-available'
  let message = `Successfully listed ${files.length} items in: ${relativePath}`;
  if (options?.recursive) {
    message += ` (recursive${options?.maxDepth !== undefined ? `, max depth ${options.maxDepth}` : ''})`;
  }
  if (options?.pattern) {
    message += ` (filtered by pattern: ${options.pattern})`;
  }
  message += ` - ${totalFiles} files, ${totalDirectories} directories`;

  return {
    type: 'tool-listFilesTool',
    toolCallId,
    state: 'output-available',
    input: {
      relative_path: relativePath,
      recursive: options?.recursive ?? false,
      pattern: options?.pattern,
      maxDepth: options?.maxDepth,
    },
    output: {
      message,
      result: {
        files,
        totalFiles,
        totalDirectories,
        truncated: false,
        itemsRemoved: 0,
      },
    },
  } as ToolPart;
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
    relativePath?: string;
    matchedPaths?: string[];
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-globTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        pattern,
        relative_path: options?.relativePath,
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-globTool',
      toolCallId,
      state: 'input-available',
      input: {
        pattern,
        relative_path: options?.relativePath,
      },
    } as ToolPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-globTool',
    toolCallId,
    state: 'output-available',
    input: {
      pattern,
      relative_path: options?.relativePath,
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
  } as ToolPart;
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
    explanation?: string;
  },
): ToolPart {
  const toolCallId = options?.toolCallId || generateId();

  if (state === 'input-streaming') {
    return {
      type: 'tool-grepSearchTool',
      toolCallId,
      state: 'input-streaming',
      input: {
        query,
        max_matches: 100,
        explanation: options?.explanation || 'Searching for pattern',
        case_sensitive: options?.caseSensitive ?? false,
      },
    } as ToolPart;
  }

  if (state === 'input-available') {
    return {
      type: 'tool-grepSearchTool',
      toolCallId,
      state: 'input-available',
      input: {
        query,
        max_matches: 100,
        explanation: options?.explanation || 'Searching for pattern',
        case_sensitive: options?.caseSensitive ?? false,
      },
    } as ToolPart;
  }

  // state === 'output-available'
  return {
    type: 'tool-grepSearchTool',
    toolCallId,
    state: 'output-available',
    input: {
      query,
      max_matches: 100,
      explanation: options?.explanation || 'Searching for pattern',
      case_sensitive: options?.caseSensitive ?? false,
    },
    output: {
      message: `Found ${totalMatches} matches for "${query}"`,
      result: {
        totalMatches,
        matches: [],
      },
    },
  } as ToolPart;
}

/**
 * Update a specific message in the state
 */
export function updateMessageInState(
  state: Partial<AppState>,
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
): Partial<AppState> {
  const chatId = state.workspace?.agentChat?.activeChatId || 'streaming-chat';
  const existingChat = state.workspace?.agentChat?.chats?.[chatId];

  const updatedMessages = (existingChat?.messages || []).map((msg) => {
    if (msg.id === messageId) {
      return updater(msg);
    }
    return msg;
  });

  return {
    ...state,
    workspace: {
      ...state.workspace,
      agentChat: {
        ...state.workspace?.agentChat,
        chats: {
          ...state.workspace?.agentChat?.chats,
          [chatId]: {
            ...existingChat,
            messages: updatedMessages,
          },
        },
      },
    },
  } as Partial<AppState>;
}

/**
 * Add a new message to the state
 */
export function addMessageToState(
  state: Partial<AppState>,
  message: ChatMessage,
): Partial<AppState> {
  const chatId = state.workspace?.agentChat?.activeChatId || 'streaming-chat';
  const existingChat = state.workspace?.agentChat?.chats?.[chatId];

  const updatedMessages = [...(existingChat?.messages || []), message];

  return {
    ...state,
    workspace: {
      ...state.workspace,
      agentChat: {
        ...state.workspace?.agentChat,
        chats: {
          ...state.workspace?.agentChat?.chats,
          [chatId]: {
            ...existingChat,
            messages: updatedMessages,
          },
        },
      },
    },
  } as Partial<AppState>;
}

/**
 * Set the isWorking flag in the state
 */
export function setIsWorkingInState(
  state: Partial<AppState>,
  isWorking: boolean,
): Partial<AppState> {
  return {
    ...state,
    workspace: {
      ...state.workspace,
      agentChat: {
        ...state.workspace?.agentChat,
        isWorking,
      },
    },
  } as Partial<AppState>;
}
