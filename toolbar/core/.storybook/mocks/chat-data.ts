import type {
  ChatMessage,
  Chat,
  TextUIPart,
  FileUIPart,
  ToolPart,
} from '@stagewise/karton-contract';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Helper to create text message parts
export function createTextPart(text: string): TextUIPart {
  return {
    type: 'text',
    text,
  };
}

// Helper to create file attachment parts
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

// Helper to create user messages
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

// Helper to create assistant messages
export function createAssistantMessage(
  text: string,
  options?: {
    id?: string;
    isStreaming?: boolean;
    toolParts?: ToolPart[];
  },
): ChatMessage {
  const parts: any[] = [...(options?.toolParts || []), createTextPart(text)];

  return {
    id: options?.id || generateId(),
    role: 'assistant',
    parts,
    metadata: {
      createdAt: new Date(),
    },
  };
}

// Helper to create a tool call part (overwrite file example)
export function createOverwriteFileToolPart(
  relativePath: string,
  content: string,
  state: 'streaming' | 'complete' | 'error' = 'complete',
  oldContent?: string,
): ToolPart {
  // Generate a simple "before" content if not provided
  const beforeContent =
    oldContent ??
    `// Old content of ${relativePath}\nexport const OldComponent = () => null;`;

  if (state === 'streaming') {
    return {
      type: 'tool-overwriteFileTool',
      toolCallId: generateId(),
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        content: content,
      },
    } as ToolPart;
  }

  if (state === 'error') {
    return {
      type: 'tool-overwriteFileTool',
      toolCallId: generateId(),
      state: 'output-error',
      input: {
        relative_path: relativePath,
        content: content,
      },
      errorText: 'File not found',
    } as ToolPart;
  }

  // state === 'complete'
  return {
    type: 'tool-overwriteFileTool',
    toolCallId: generateId(),
    state: 'output-available',
    input: {
      relative_path: relativePath,
      content: content,
    },
    output: {
      message: 'File updated successfully',
      hiddenMetadata: {
        diff: {
          path: relativePath,
          before: beforeContent,
          after: content,
        },
        undoExecute: async () => {
          // Mock undo function
        },
      },
    },
  } as ToolPart;
}

// Helper to create read file tool part
export function createReadFileToolPart(
  relativePath: string,
  content: string,
  state: 'streaming' | 'complete' = 'complete',
): ToolPart {
  if (state === 'streaming') {
    return {
      type: 'tool-readFileTool',
      toolCallId: generateId(),
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        explanation: 'Reading file',
      },
    } as ToolPart;
  }

  // state === 'complete'
  return {
    type: 'tool-readFileTool',
    toolCallId: generateId(),
    state: 'output-available',
    input: {
      relative_path: relativePath,
      explanation: 'Reading file',
    },
    output: {
      success: true,
      message: 'File read successfully',
      result: {
        content,
        totalLines: content.split('\n').length,
        truncated: false,
        originalSize: content.length,
        cappedSize: content.length,
      },
    },
  } as ToolPart;
}

// Helper to create multi-edit tool part
export function createMultiEditToolPart(
  relativePath: string,
  newContent: string,
  state: 'streaming' | 'complete' | 'error' = 'complete',
  oldContent?: string,
): ToolPart {
  const beforeContent =
    oldContent ??
    `// Old content of ${relativePath}\nexport const OldComponent = () => null;`;

  if (state === 'streaming') {
    return {
      type: 'tool-multiEditTool',
      toolCallId: generateId(),
      state: 'input-streaming',
      input: {
        relative_path: relativePath,
        edits: [{ old_string: beforeContent, new_string: newContent }],
      },
    } as ToolPart;
  }

  if (state === 'error') {
    return {
      type: 'tool-multiEditTool',
      toolCallId: generateId(),
      state: 'output-error',
      input: {
        relative_path: relativePath,
        edits: [{ old_string: beforeContent, new_string: newContent }],
      },
      errorText: 'File not found',
    } as ToolPart;
  }

  // state === 'complete'
  return {
    type: 'tool-multiEditTool',
    toolCallId: generateId(),
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
        undoExecute: async () => {
          // Mock undo function
        },
      },
    },
  } as ToolPart;
}

// Preset chat scenarios
export function createEmptyChat(): Chat {
  return {
    title: 'New Chat',
    createdAt: new Date(),
    messages: [],
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 0,
    },
  };
}

export function createSimpleChat(): Chat {
  return {
    title: 'Simple Conversation',
    createdAt: new Date(),
    messages: [
      createUserMessage('Hello! Can you help me with my React component?'),
      createAssistantMessage(
        "Of course! I'd be happy to help you with your React component. What specific issue or improvement are you looking to address?",
      ),
      createUserMessage(
        'I need to add a loading state to my button component.',
      ),
      createAssistantMessage(
        "I'll help you add a loading state to your button component. Let me update the file for you.",
        {
          toolParts: [
            createOverwriteFileToolPart(
              'src/components/Button.tsx',
              `export const Button = ({ isLoading, children, ...props }) => {
  return (
    <button disabled={isLoading} {...props}>
      {isLoading ? 'Loading...' : children}
    </button>
  );
};`,
            ),
          ],
        },
      ),
    ],
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 5420,
    },
  };
}

export function createChatWithManyMessages(): Chat {
  const messages: ChatMessage[] = [];

  for (let i = 0; i < 10; i++) {
    messages.push(
      createUserMessage(`This is user message number ${i + 1}`),
      createAssistantMessage(
        `This is assistant response number ${i + 1}. Here's some helpful information about your question.`,
      ),
    );
  }

  return {
    title: 'Long Conversation',
    createdAt: new Date(Date.now() - 3600000), // 1 hour ago
    messages,
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 45000,
    },
  };
}

export function createStreamingChat(): Chat {
  return {
    title: 'Streaming Response',
    createdAt: new Date(),
    messages: [
      createUserMessage('Can you refactor this function?'),
      createAssistantMessage('Sure! Let me take a look at that function and'),
    ],
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 1200,
    },
  };
}

export function createChatWithToolCalls(): Chat {
  return {
    title: 'Tool Calls Demo',
    createdAt: new Date(),
    messages: [
      createUserMessage('Update the header component to be responsive'),
      createAssistantMessage('Let me check the current implementation first.', {
        toolParts: [
          createReadFileToolPart(
            'src/components/Header.tsx',
            `export const Header = () => {
  return <header>My App</header>;
};`,
          ),
        ],
      }),
      createAssistantMessage("I'll update it to be responsive.", {
        toolParts: [
          createOverwriteFileToolPart(
            'src/components/Header.tsx',
            `export const Header = () => {
  return (
    <header className="w-full px-4 md:px-8 lg:px-12">
      <h1 className="text-lg md:text-xl lg:text-2xl">My App</h1>
    </header>
  );
};`,
          ),
        ],
      }),
    ],
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 8920,
    },
  };
}

export function createChatWithError(): Chat {
  return {
    title: 'Error Scenario',
    createdAt: new Date(),
    messages: [
      createUserMessage('Delete the config file'),
      createAssistantMessage('Attempting to delete the file.', {
        toolParts: [createOverwriteFileToolPart('config.json', '', 'error')],
      }),
    ],
    error: {
      type: 'agent-error' as any,
      error: {
        name: 'AgentError',
        message: 'Failed to complete the requested operation',
      },
    },
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 2100,
    },
  };
}

export function createChatWithFileAttachments(): Chat {
  return {
    title: 'With Attachments',
    createdAt: new Date(),
    messages: [
      createUserMessage('Can you review this code?', {
        fileAttachments: [
          createFilePart(
            'screenshot.png',
            'image/png',
            'data:image/png;base64,',
          ),
        ],
      }),
      createAssistantMessage(
        'Looking at your screenshot, I can see the issue. Let me help you fix it.',
      ),
    ],
    usage: {
      maxContextWindowSize: 200000,
      usedContextWindowSize: 3200,
    },
  };
}
