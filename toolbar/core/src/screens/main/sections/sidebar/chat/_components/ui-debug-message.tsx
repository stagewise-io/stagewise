import type { ChatMessage } from '@stagewise/karton-contract';

const uiDebugParts: ChatMessage['parts'] = [
  {
    type: 'text',
    text: 'Hello! This is a simple text message.',
  },
  {
    type: 'reasoning',
    text: "I'm thinking in this message here. Loren ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  },
  {
    type: 'file',
    url: 'https://stagewise.io/favicon.png',
    mediaType: 'image/png',
    filename: 'not-existing.png',
  },
  {
    type: 'file',
    url: 'https://stagewise.io/icon.png',
    mediaType: 'image/png',
    filename: 'icon.png',
  },
  {
    type: 'text',
    text: 'This is a short text that includes a [link to something](https://www.stagewise.io).',
  },
  {
    type: 'file',
    url: 'https://www.digitale-verwaltung.de/SharedDocs/downloads/Webs/DV/DE/UPO/behoerdenaustausch.pdf?__blob=publicationFile&v=2',
    mediaType: 'application/pdf',
    filename: 'dummy-pdf.pdf',
  },
  {
    type: 'text',
    text: '# Hey!\n\nI\'m a markdown formatted text part. Here\'s a code block:\n\n```tsx\nconsole.log("Hello, world!");\nconsole.log("Another line of code with longer text content that leads to horizontal overflow if not properly handled.");\n\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\nconsole.log("Hello, world!");\n``` \n\nAnd here\'s a mermaid diagram:\n\n```mermaid\ngraph TD;\n  A-->B;\n  A-->C;\n  B-->D;\n  C-->D;\n```\n\nCool right??`inline code`',
  },
  {
    type: 'dynamic-tool',
    toolCallId: 'dummy-tool-call-id',
    toolName: 'unknown-dynamic-tool',
    state: 'input-streaming',
    input: {
      type: 'text',
      text: 'This is a dummy tool input.',
    },
  },
  {
    type: 'dynamic-tool',
    toolCallId: 'dummy-tool-call-id-2',
    toolName: 'unknown-dynamic-tool',
    state: 'input-available',
    input: {
      type: 'text',
      text: 'This is a dummy tool input.',
    },
  },
  {
    type: 'dynamic-tool',
    toolCallId: 'dummy-tool-call-id-3',
    toolName: 'unknown-dynamic-tool',
    state: 'output-available',
    input: {
      type: 'text',
      text: 'This is a dummy tool input.',
    },
    output: {
      type: 'text',
      text: 'This is a dummy tool output.',
    },
  },
  {
    type: 'dynamic-tool',
    toolCallId: 'dummy-tool-call-id-4',
    toolName: 'unknown-dynamic-tool',
    state: 'output-error',
    input: {
      type: 'text',
      text: 'This is a dummy tool input.',
    },
    errorText: 'This is a dummy tool error.',
  },
  {
    type: 'dynamic-tool',
    toolCallId: 'dummy-tool-call-id-2',
    toolName: 'unknown-dynamic-tool',
    state: 'output-available',
    input: {},
    output: {
      type: 'text',
      text: 'This is a dummy tool result.',
    },
  },
  {
    type: 'tool-deleteFileTool',
    toolCallId: 'delete-file-tool-call-id-1',
    state: 'input-streaming',
    input: {
      path: 'dummy-path.txt',
    },
  },
  {
    type: 'tool-deleteFileTool',
    toolCallId: 'delete-file-tool-call-id-2',
    state: 'input-available',
    input: {
      path: 'dummy-path.txt',
    },
  },
  {
    type: 'tool-deleteFileTool',
    toolCallId: 'delete-file-tool-call-id-3',
    state: 'output-available',
    input: {
      path: 'dummy-path.tsx',
    },
    output: {
      message: 'File deleted successfully.',
      hiddenMetadata: {
        undoExecute: () => Promise.resolve(),
        diff: {
          path: 'dummy-path.tsx',
          before:
            'import React from "react";\nimport Button from "button";\nconst App = () => {\n  return <div>Hello, world!</div>;\n};\n\nexport default App;\n',
          after:
            'import React from "react";\nimport Button from "button";\nconst App2 = () => {\n  return <div>Hello, world!</div>;\n};\n\nexport default App2;\n',
        },
      },
    },
  },
  {
    type: 'tool-deleteFileTool',
    toolCallId: 'delete-file-tool-call-id-4',
    state: 'output-error',
    input: {
      path: 'dummy-path.txt',
    },
    errorText: 'This is a dummy tool error.',
  },
  {
    type: 'tool-globTool',
    toolCallId: 'glob-tool-call-id-1',
    state: 'input-available',
    input: {
      pattern: 'dummy-pattern.txt',
      path: 'dummy-path.txt',
    },
  },
  {
    type: 'tool-globTool',
    toolCallId: 'glob-tool-call-id-2',
    state: 'output-available',
    input: {
      pattern: 'dummy-pattern.txt',
      path: 'dummy-path.txt',
    },
    output: {
      message: 'File globbed successfully.',
      result: {
        relativePaths: ['dummy-path.txt'],
        totalMatches: 1,
        truncated: false,
        itemsRemoved: 0,
      },
    },
  },
  {
    type: 'tool-globTool',
    toolCallId: 'glob-tool-call-id-3',
    state: 'output-error',
    input: {
      pattern: 'dummy-pattern.txt',
      path: 'dummy-path.txt',
    },
    errorText: 'This is a dummy tool error.',
  },
  {
    type: 'tool-grepSearchTool',
    toolCallId: 'grep-search-tool-call-id-1',
    state: 'input-available',
    input: {
      query: 'dummy-query',
      max_matches: 10,
      explanation: 'This is a dummy tool explanation.',
    },
  },
  {
    type: 'tool-grepSearchTool',
    toolCallId: 'grep-search-tool-call-id-2',
    state: 'output-available',
    input: {
      query: 'dummy-query',
      max_matches: 10,
      explanation: 'This is a dummy tool explanation.',
    },
    output: {
      message: 'File grepped successfully.',
      result: {
        matches: [
          {
            relativePath: 'dummy-path.txt',
            line: 1,
            column: 1,
            match: 'dummy-match',
            preview: 'This is a dummy preview.',
          },
        ],
        totalMatches: 1,
        filesSearched: 1,
        truncated: false,
        itemsRemoved: 0,
      },
    },
  },
  {
    type: 'tool-grepSearchTool',
    toolCallId: 'grep-search-tool-call-id-3',
    state: 'output-error',
    input: {
      query: 'dummy-query',
      max_matches: 10,
      explanation: 'This is a dummy tool explanation.',
    },
    errorText: 'This is a dummy tool error.',
  },
  {
    type: 'tool-listFilesTool',
    toolCallId: 'list-files-tool-call-id-1',
    state: 'input-available',
    input: {
      path: 'dummy-path.txt',
      recursive: true,
      maxDepth: 10,
      pattern: 'dummy-pattern.txt',
      includeDirectories: true,
      includeFiles: true,
    },
  },
  {
    type: 'tool-listFilesTool',
    toolCallId: 'list-files-tool-call-id-2',
    state: 'output-available',
    input: {
      path: 'dummy-path.txt',
      recursive: true,
      maxDepth: 10,
      pattern: 'dummy-pattern.txt',
      includeDirectories: true,
      includeFiles: true,
    },
    output: {
      message: 'Files listed successfully.',
      result: {
        files: [
          {
            relativePath: 'dummy-path.txt',
            name: 'dummy-name',
            type: 'file',
            depth: 0,
            size: 100,
          },
          {
            relativePath: 'dummy-path.txt',
            name: 'dummy-name',
            type: 'directory',
            depth: 0,
            size: undefined,
          },
        ],
        totalFiles: 1,
        totalDirectories: 0,
        truncated: false,
        itemsRemoved: 0,
      },
    },
  },
  {
    type: 'tool-listFilesTool',
    toolCallId: 'list-files-tool-call-id-3',
    state: 'output-error',
    input: {
      path: 'dummy-path.txt',
      recursive: true,
      maxDepth: 10,
      pattern: 'dummy-pattern.txt',
      includeDirectories: true,
      includeFiles: true,
    },
    errorText: 'This is a dummy tool error.',
  },

  {
    type: 'tool-multiEditTool',
    toolCallId: 'multi-edit-tool-call-id-1',
    state: 'input-streaming',
    input: {
      file_path: 'dummy-path.txt',
      edits: [
        {
          old_string: 'dummy-old-string',
          new_string: 'dummy-new-string',
        },
      ],
    },
  },
  {
    type: 'tool-multiEditTool',
    toolCallId: 'multi-edit-tool-call-id-2',
    state: 'input-available',
    input: {
      file_path: 'dummy-path.txt',
      edits: [
        {
          old_string: 'dummy-old-string',
          new_string: 'dummy-new-string',
        },
      ],
    },
  },
  {
    type: 'tool-multiEditTool',
    toolCallId: 'multi-edit-tool-call-id-3',
    state: 'output-available',
    input: {
      file_path: 'dummy-path.js',
      edits: [
        {
          old_string: 'dummy-old-string',
          new_string: 'dummy-new-string',
        },
      ],
    },
    output: {
      message: 'File multi-edited successfully.',
      result: {
        editsApplied: 1,
      },
      hiddenMetadata: {
        undoExecute: () => Promise.resolve(),
        diff: {
          path: 'dummy-path.js',
          before:
            'import React from "react";\nimport Button from "button";\nconst App = () => {\n  return <div>Hello, world!</div>;\n};\n\nexport default App;\nexport { Button };\n',
          after:
            'import React from "react";\nimport Button from "button";\nconst App2 = () => {\n  return <div>Hello, world!</div>;\n};\n\nexport default App2;\nexport { Button };\n',
        },
      },
    },
  },
  {
    type: 'tool-multiEditTool',
    toolCallId: 'multi-edit-tool-call-id-4',
    state: 'output-error',
    input: {
      file_path: 'dummy-path.txt',
      edits: [
        {
          old_string: 'dummy-old-string',
          new_string: 'dummy-new-string',
        },
      ],
    },
    errorText: 'This is a veeeeeeeeerryy loooonng dummy tool error.',
  },
  {
    type: 'tool-overwriteFileTool',
    toolCallId: 'overwrite-file-tool-call-id-1',
    state: 'input-streaming',
    input: {
      path: 'dummy-path.txt',
      content: 'dummy-content.txt',
    },
  },
  {
    type: 'tool-overwriteFileTool',
    toolCallId: 'overwrite-file-tool-call-id-2',
    state: 'input-available',
    input: {
      path: 'dummy-path.txt',
      content: 'dummy-content.txt',
    },
  },
];

export const uiDebugMessages: ChatMessage[] = [
  {
    role: 'assistant',
    id: 'dummy-message-id-1',
    metadata: undefined,
    parts: uiDebugParts,
  },
  {
    role: 'user',
    id: 'dummy-message-id-2',
    metadata: undefined,
    parts: uiDebugParts,
  },
];
