import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { ModelProviderService } from '@/agents/model-provider';

// ---------------------------------------------------------------------------
// Mock `ai` module
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import {
  generateSimpleCompressedHistory,
  convertAgentMessagesToCompactMessageHistoryString,
  estimateMessageTokens,
} from '.';

const generateTextMock = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessages(count: number): AgentMessage[] {
  const msgs: AgentMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `Message ${i}` }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as AgentMessage);
  }
  return msgs;
}

function makeMockModelProviderService(): ModelProviderService {
  return {
    getModelWithOptions: vi.fn().mockReturnValue({
      model: { id: 'mock-model' },
      providerOptions: {},
      headers: {},
      contextWindowSize: 100_000,
      providerMode: 'stagewise',
    }),
  } as unknown as ModelProviderService;
}

// ---------------------------------------------------------------------------
// convertAgentMessagesToCompactMessageHistoryString
// ---------------------------------------------------------------------------

describe('convertAgentMessagesToCompactMessageHistoryString', () => {
  it('converts user and assistant messages to XML format', () => {
    const messages = makeMessages(4);
    const result = convertAgentMessagesToCompactMessageHistoryString(messages);

    expect(result).toContain('<user>Message 0</user>');
    expect(result).toContain('<assistant>Message 1</assistant>');
    expect(result).toContain('<user>Message 2</user>');
    expect(result).toContain('<assistant>Message 3</assistant>');
  });

  it('stops at a message with compressedHistory and includes previous history', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Old message' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Old response' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-2',
        role: 'user',
        parts: [{ type: 'text', text: 'New message' }],
        metadata: {
          createdAt: new Date(),
          partsMetadata: [],
          compressedHistory: 'Previous summary here',
        },
      } as AgentMessage,
      {
        id: 'msg-3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'New response' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);

    // Should include previous-chat-history
    expect(result).toContain(
      '<previous-chat-history>Previous summary here</previous-chat-history>',
    );
    // Should include messages from the compressedHistory message onwards
    expect(result).toContain('<user>New message</user>');
    expect(result).toContain('<assistant>New response</assistant>');
    // Should NOT include messages before the compressedHistory boundary
    expect(result).not.toContain('Old message');
    expect(result).not.toContain('Old response');
  });

  it('serializes tool-readFile parts as compact one-liners', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Read the file' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-readFile',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: { relative_path: 'w1/src/index.ts' },
            output: { content: 'file contents here' },
          },
          { type: 'text', text: 'I read the file.' },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[read: w1/src/index.ts]');
    expect(result).toContain('I read the file.');
  });

  it('serializes tool-multiEdit parts with edit count', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Fix the bug' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-multiEdit',
            toolCallId: 'tc-2',
            state: 'output-available',
            input: {
              relative_path: 'w1/src/utils.ts',
              edits: [
                { old_string: 'a', new_string: 'b' },
                { old_string: 'c', new_string: 'd' },
              ],
            },
            output: {},
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[edited: w1/src/utils.ts (2 edits)]');
  });

  it('serializes tool-overwriteFile, tool-deleteFile, and tool-executeShellCommand', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Do the work' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-overwriteFile',
            toolCallId: 'tc-3',
            state: 'output-available',
            input: { relative_path: 'w1/new-file.ts', content: '// new' },
            output: {},
          },
          {
            type: 'tool-deleteFile',
            toolCallId: 'tc-4',
            state: 'output-available',
            input: { relative_path: 'w1/old-file.ts' },
            output: {},
          },
          {
            type: 'tool-executeShellCommand',
            toolCallId: 'tc-5',
            state: 'output-available',
            input: { explanation: 'Run tests', command: 'pnpm test' },
            output: {},
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[wrote: w1/new-file.ts]');
    expect(result).toContain('[deleted: w1/old-file.ts]');
    expect(result).toContain('[shell: Run tests]');
  });

  it('serializes tool-grepSearch with query and file pattern', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Find usage' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-grepSearch',
            toolCallId: 'tc-6',
            state: 'output-available',
            input: {
              mount_prefix: 'w1',
              query: 'useState',
              include_file_pattern: '**/*.tsx',
            },
            output: {},
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[searched: "useState" in **/*.tsx]');
  });

  it('serializes tool-executeSandboxJs with explanation', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Take a screenshot' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-executeSandboxJs',
            toolCallId: 'tc-7',
            state: 'output-available',
            input: {
              explanation: 'Take a screenshot',
              script: 'await API.sendCDP(...)',
            },
            output: {},
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[sandbox: Take a screenshot]');
  });

  it('emits a generic marker for unknown tool types', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Do something' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-futureTool',
            toolCallId: 'tc-8',
            state: 'output-available',
            input: { foo: 'bar' },
            output: {},
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[tool-futureTool]');
  });

  it('serializes user metadata annotations for attachments and mentions', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Fix the button' }],
        metadata: {
          createdAt: new Date(),
          partsMetadata: [],
          fileAttachments: [
            {
              id: 'att-1',
              fileName: 'screenshot.png',
              mediaType: 'image/png',
              sizeBytes: 1024,
            },
          ],
          mentions: [
            {
              providerType: 'file',
              mountedPath: 'w1/src/button.tsx',
              relativePath: 'src/button.tsx',
              mountPrefix: 'w1',
              fileName: 'button.tsx',
            },
            {
              providerType: 'tab',
              tabId: 't-1',
              url: 'http://localhost',
              title: 'Dev Server',
            },
          ],
        },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Fixed it.' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[attached: screenshot.png]');
    expect(result).toContain('[mentioned: w1/src/button.tsx, Dev Server]');
    expect(result).toContain('Fix the button');
  });

  it('handles assistant messages with only tool parts (no text)', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Check the files' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-readFile',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: { relative_path: 'w1/a.ts' },
            output: {},
          },
          {
            type: 'tool-readFile',
            toolCallId: 'tc-2',
            state: 'output-available',
            input: { relative_path: 'w1/b.ts' },
            output: {},
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[read: w1/a.ts]');
    expect(result).toContain('[read: w1/b.ts]');
    // Should NOT be an empty <assistant></assistant>
    expect(result).not.toContain('<assistant></assistant>');
  });

  // -----------------------------------------------------------------------
  // Output-aware serialisation
  // -----------------------------------------------------------------------

  it('shell: shows exit code on failure and ✓ on success', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Run stuff' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-executeShellCommand',
            toolCallId: 'tc-ok',
            state: 'output-available',
            input: { explanation: 'Run tests', command: 'pnpm test' },
            output: {
              message: '',
              output: '',
              stderr: '',
              exit_code: 0,
              timed_out: false,
              aborted: false,
            },
          },
          {
            type: 'tool-executeShellCommand',
            toolCallId: 'tc-fail',
            state: 'output-available',
            input: { explanation: 'Build project', command: 'pnpm build' },
            output: {
              message: '',
              output: '',
              stderr: '',
              exit_code: 1,
              timed_out: false,
              aborted: false,
            },
          },
          {
            type: 'tool-executeShellCommand',
            toolCallId: 'tc-timeout',
            state: 'output-available',
            input: { explanation: 'Long process', command: 'sleep 999' },
            output: {
              message: '',
              output: '',
              stderr: '',
              exit_code: null,
              timed_out: true,
              aborted: false,
            },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[shell: Run tests → ✓]');
    expect(result).toContain('[shell: Build project → exit 1]');
    expect(result).toContain('[shell: Long process → timed out]');
  });

  it('lint: shows issue summary or clean', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Lint' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-getLintingDiagnostics',
            toolCallId: 'tc-lint-clean',
            state: 'output-available',
            input: { paths: ['w1/a.ts'] },
            output: {
              message: '',
              files: [],
              summary: {
                totalFiles: 1,
                totalIssues: 0,
                errors: 0,
                warnings: 0,
                infos: 0,
                hints: 0,
              },
            },
          },
          {
            type: 'tool-getLintingDiagnostics',
            toolCallId: 'tc-lint-issues',
            state: 'output-available',
            input: { paths: ['w1/b.ts', 'w1/c.ts'] },
            output: {
              message: '',
              files: [],
              summary: {
                totalFiles: 2,
                totalIssues: 5,
                errors: 3,
                warnings: 2,
                infos: 0,
                hints: 0,
              },
            },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[lint: w1/a.ts → clean]');
    expect(result).toContain('[lint: w1/b.ts, w1/c.ts → 3 errors, 2 warnings]');
  });

  it('askUserQuestions: shows answers when completed', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Configure' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-askUserQuestions',
            toolCallId: 'tc-ask',
            state: 'output-available',
            input: {
              title: 'Setup Options',
              steps: [
                {
                  fields: [
                    {
                      type: 'input',
                      questionId: 'name',
                      label: 'Project name',
                    },
                    {
                      type: 'radio-group',
                      questionId: 'lang',
                      label: 'Language',
                      options: [{ value: 'ts', label: 'TypeScript' }],
                    },
                  ],
                },
              ],
            },
            output: {
              completed: true,
              cancelled: false,
              answers: { name: 'my-app', lang: 'ts' },
              completedSteps: 1,
            },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain(
      '[asked user: Setup Options → Project name: my-app; Language: ts]',
    );
  });

  it('askUserQuestions: shows cancel reason when cancelled', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Ask' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-askUserQuestions',
            toolCallId: 'tc-cancel',
            state: 'output-available',
            input: {
              title: 'Preferences',
              steps: [
                { fields: [{ type: 'input', questionId: 'q1', label: 'Q1' }] },
              ],
            },
            output: {
              completed: false,
              cancelled: true,
              cancelReason: 'user_sent_message',
              answers: {},
              completedSteps: 0,
            },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[asked user: Preferences → user_sent_message]');
  });

  it('overwriteFile: distinguishes created vs wrote', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Write files' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-overwriteFile',
            toolCallId: 'tc-create',
            state: 'output-available',
            input: { relative_path: 'w1/new.ts', content: '// new' },
            output: { message: 'Successfully created file: new.ts' },
          },
          {
            type: 'tool-overwriteFile',
            toolCallId: 'tc-update',
            state: 'output-available',
            input: { relative_path: 'w1/existing.ts', content: '// updated' },
            output: { message: 'Successfully updated file: existing.ts' },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[created: w1/new.ts]');
    expect(result).toContain('[wrote: w1/existing.ts]');
  });

  it('tool error states: shows ✗ marker with error text', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Do things' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-readFile',
            toolCallId: 'tc-err',
            state: 'output-error',
            input: { relative_path: 'w1/missing.ts' },
            errorText: 'File not found: w1/missing.ts',
          },
          {
            type: 'tool-multiEdit',
            toolCallId: 'tc-err2',
            state: 'output-error',
            input: { relative_path: 'w1/locked.ts', edits: [] },
            errorText: 'Permission denied',
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as unknown as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain(
      '[read: w1/missing.ts ✗ File not found: w1/missing.ts]',
    );
    expect(result).toContain('[edited: w1/locked.ts ✗ Permission denied]');
  });

  // -----------------------------------------------------------------------
  // Resilience / graceful-degradation
  // -----------------------------------------------------------------------

  it('survives null/undefined messages in the array', () => {
    const messages = [
      null,
      undefined,
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
      null,
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('<user>Hello</user>');
  });

  it('returns empty string for non-array input', () => {
    const result = convertAgentMessagesToCompactMessageHistoryString(
      null as unknown as AgentMessage[],
    );
    expect(result).toBe('');
  });

  it('survives message.parts being null/undefined', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'user',
        parts: null,
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
      {
        id: 'msg-1',
        role: 'assistant',
        parts: undefined,
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    // Should not throw; empty parts → empty tags
    expect(result).toContain('<user>');
    expect(result).toContain('<assistant>');
  });

  it('survives part.text being null/undefined/number', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [
          { type: 'text', text: null },
          { type: 'text', text: undefined },
          { type: 'text', text: 42 },
          { type: 'text', text: 'valid' },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('valid');
    // The non-string values should not crash; they should coerce or be skipped
    expect(result).not.toBe('');
  });

  it('survives a tool part with completely wrong shape', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Go' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          // Totally wrong shape — no input, random properties
          { type: 'tool-readFile', garbage: true },
          // Input exists but relative_path is a number
          { type: 'tool-readFile', input: { relative_path: 123 } },
          // A normal part that should still serialize
          {
            type: 'tool-readFile',
            input: { relative_path: 'w1/good.ts' },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    // The good part should survive
    expect(result).toContain('[read: w1/good.ts]');
    // The one with input but wrong type for relative_path should still
    // produce something (string interpolation → "123")
    expect(result).toContain('[read: 123]');
  });

  it('survives null elements in attachments / mentions arrays', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
        metadata: {
          createdAt: new Date(),
          partsMetadata: [],
          fileAttachments: [null, { fileName: 'a.png' }, undefined],
          mentions: [
            null,
            { providerType: 'file', mountedPath: 'w1/foo.ts' },
            undefined,
          ],
        },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[attached: a.png]');
    expect(result).toContain('[mentioned: w1/foo.ts]');
  });

  it('survives askUserQuestions with null answers', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Ask' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-askUserQuestions',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: {
              title: 'Prefs',
              steps: [{ fields: [{ questionId: 'q1', label: 'Q1' }] }],
            },
            output: {
              completed: true,
              cancelled: false,
              answers: null, // ← the crash vector
            },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    // Should not throw; should produce a reasonable fallback
    expect(result).toContain('[asked user: Prefs');
  });

  it('survives askUserQuestions with missing input.title / input.steps', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Ask' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-askUserQuestions',
            toolCallId: 'tc-1',
            state: 'output-available',
            input: {}, // ← no title, no steps
            output: {
              completed: true,
              cancelled: false,
              answers: { q1: 'yes' },
            },
          },
        ],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('[asked user: form');
  });

  it('survives a message with unknown role', () => {
    const messages = [
      {
        id: 'msg-0',
        role: 'system', // not handled by serialization
        parts: [{ type: 'text', text: 'System prompt' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Real message' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      },
    ] as unknown as AgentMessage[];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);
    expect(result).toContain('Real message');
    // system role should be silently skipped
    expect(result).not.toContain('System prompt');
  });
});

// ---------------------------------------------------------------------------
// generateSimpleCompressedHistory
// ---------------------------------------------------------------------------

describe('generateSimpleCompressedHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the compressed history from the first model when it succeeds', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'The user asked the assistant to help with a task.',
    } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe('The user asked the assistant to help with a task.');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(mps.getModelWithOptions).toHaveBeenCalledWith(
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.objectContaining({ $ai_span_name: 'history-compression' }),
    );
  });

  it('falls back to the second model when the first fails', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockResolvedValueOnce({
        text: 'The assistant provided a GPT-based summary of events.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(
      'The assistant provided a GPT-based summary of events.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
  });

  it('falls back to the third model when the first two fail', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockRejectedValueOnce(new Error('GPT failed'))
      .mockResolvedValueOnce({
        text: 'The assistant provided a Haiku-based summary of events.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(
      'The assistant provided a Haiku-based summary of events.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      3,
      'claude-haiku-4-5',
      'agent-1',
      expect.any(Object),
    );
  });

  it('throws when all three models fail', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockRejectedValueOnce(new Error('GPT failed'))
      .mockRejectedValueOnce(new Error('Haiku failed'));

    const mps = makeMockModelProviderService();
    await expect(
      generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1'),
    ).rejects.toThrow('Haiku failed');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
  });

  it('falls back when the abort signal fires (simulating timeout)', async () => {
    generateTextMock.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a fallback summary of events.',
    } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe('The assistant provided a fallback summary of events.');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a hanging first model via the 15s timeout and falls back', async () => {
    generateTextMock.mockImplementationOnce(({ abortSignal }: any) => {
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a timeout fallback summary of events.',
    } as any);

    const mps = makeMockModelProviderService();
    const promise = generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    await vi.advanceTimersByTimeAsync(15_000);

    const result = await promise;
    expect(result).toBe(
      'The assistant provided a timeout fallback summary of events.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      1,
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.any(Object),
    );
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
  });

  it('exhausts all models via timeout and throws', async () => {
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    generateTextMock
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError);

    const mps = makeMockModelProviderService();
    await expect(
      generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1'),
    ).rejects.toThrow('aborted');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      1,
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.any(Object),
    );
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      3,
      'claude-haiku-4-5',
      'agent-1',
      expect.any(Object),
    );
  });

  it('falls back when the compression is shorter than 30 characters', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: 'Too short' } as any)
      .mockResolvedValueOnce({
        text: 'This is a sufficiently long compression result for the test.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(
      'This is a sufficiently long compression result for the test.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('accepts compression that is exactly 30 characters', async () => {
    const exactly30 = 'a'.repeat(30);
    generateTextMock.mockResolvedValueOnce({ text: exactly30 } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(exactly30);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace before checking length', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: '   short   ' } as any)
      .mockResolvedValueOnce({
        text: 'A valid compression that is long enough to pass.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe('A valid compression that is long enough to pass.');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('passes an abortSignal to generateText', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a valid summary of events.',
    } as any);

    const mps = makeMockModelProviderService();
    await generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1');

    const callArgs = generateTextMock.mock.calls[0][0] as any;
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('uses second-person "you" POV and includes key prompt elements', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'You implemented the navbar and the user was satisfied.',
    } as any);

    const mps = makeMockModelProviderService();
    await generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1');

    const callArgs = generateTextMock.mock.calls[0][0] as any;
    const systemMsg = callArgs.messages.find((m: any) => m.role === 'system');
    // POV: second-person for agent, third-person for user
    expect(systemMsg.content).toContain('"you"');
    expect(systemMsg.content).toContain('"the user"');
    // Should NOT use the old third-person instruction
    expect(systemMsg.content).not.toContain(
      'Refer to participants as "user" and "assistant"',
    );
    // Input format explanation for tool annotations
    expect(systemMsg.content).toContain('[read: path]');
    expect(systemMsg.content).toContain('[shell: label');
    // Structure guidance: `##` headings, recency bias
    expect(systemMsg.content).toContain('`##` headings');
    expect(systemMsg.content).toContain('Recency bias');
    // User prompt includes continuity framing
    const userMsg = callArgs.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toContain('own memory');
  });

  it('falls back when getModelWithOptions throws for a model', async () => {
    const mps = makeMockModelProviderService();
    const getModelMock = vi.mocked(mps.getModelWithOptions);

    getModelMock.mockImplementationOnce(() => {
      throw new Error('Model not found');
    });
    getModelMock.mockReturnValueOnce({
      model: { id: 'gpt-mock' },
      providerOptions: {},
      headers: {},
      contextWindowSize: 100_000,
      providerMode: 'stagewise',
    } as any);
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a provider-fallback summary of events.',
    } as any);

    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );
    expect(result).toBe(
      'The assistant provided a provider-fallback summary of events.',
    );
  });
});

// ---------------------------------------------------------------------------
// estimateMessageTokens
// ---------------------------------------------------------------------------

describe('estimateMessageTokens', () => {
  it('estimates user message with single text part', () => {
    const msg = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello world' }], // 11 chars → ceil(11/4) = 3
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as AgentMessage;
    // 11 chars content + 400 metadata overhead
    expect(estimateMessageTokens(msg)).toBe(Math.ceil((11 + 400) / 4));
  });

  it('estimates user message with multiple text parts', () => {
    const msg = {
      id: 'u2',
      role: 'user',
      parts: [
        { type: 'text', text: 'aaaa' }, // 4 chars
        { type: 'text', text: 'bbbbbbbb' }, // 8 chars
      ],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as AgentMessage;
    // 12 chars content + 400 metadata overhead
    expect(estimateMessageTokens(msg)).toBe(Math.ceil((12 + 400) / 4));
  });

  it('estimates assistant message with text and tool call', () => {
    const toolInput = { relative_path: 'src/index.ts' };
    const msg = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Let me read that file.' },
        {
          type: 'tool-readFile',
          toolName: 'readFile',
          input: toolInput,
          output: { content: 'file contents here' },
          state: 'output-available',
        },
      ],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as unknown as AgentMessage;
    const result = estimateMessageTokens(msg);
    // Should include text + toolName + serialised input + serialised output + metadata overhead
    const expectedChars =
      'Let me read that file.'.length +
      'readFile'.length +
      JSON.stringify(toolInput).length +
      JSON.stringify({ content: 'file contents here' }).length +
      400; // metadata overhead
    expect(result).toBe(Math.ceil(expectedChars / 4));
  });

  it('returns 0 for empty message (no parts)', () => {
    const msg = {
      id: 'e1',
      role: 'user',
      parts: [],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as AgentMessage;
    // Empty parts but still has metadata overhead
    expect(estimateMessageTokens(msg)).toBe(Math.ceil(400 / 4));
  });

  it('returns 0 for null/undefined message', () => {
    expect(estimateMessageTokens(null as unknown as AgentMessage)).toBe(0);
    expect(estimateMessageTokens(undefined as unknown as AgentMessage)).toBe(0);
  });

  it('handles message with no parts array gracefully', () => {
    const msg = { id: 'x', role: 'user' } as unknown as AgentMessage;
    expect(estimateMessageTokens(msg)).toBe(0);
  });

  it('handles unknown part type via JSON fallback', () => {
    const msg = {
      id: 'u3',
      role: 'user',
      parts: [{ type: 'custom-widget', data: { foo: 'bar' } }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as unknown as AgentMessage;
    const result = estimateMessageTokens(msg);
    const expectedChars =
      JSON.stringify({
        type: 'custom-widget',
        data: { foo: 'bar' },
      }).length + 400; // metadata overhead
    expect(result).toBe(Math.ceil(expectedChars / 4));
  });

  it('scales proportionally with large content', () => {
    const largeText = 'x'.repeat(100_000);
    const msg = {
      id: 'u4',
      role: 'user',
      parts: [{ type: 'text', text: largeText }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as AgentMessage;
    // 100k chars + 400 metadata overhead
    expect(estimateMessageTokens(msg)).toBe(Math.ceil((100_000 + 400) / 4));
  });
});
