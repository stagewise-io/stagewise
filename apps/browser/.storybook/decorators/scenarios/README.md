# Agent Lifecycle Scenario Decorators

Scenario-based Storybook decorators that simulate complete agent message lifecycles with realistic timing and multi-phase interactions.

## Overview

These decorators provide an easy way to showcase complex agent behaviors in Storybook without writing timeline events manually. Each scenario represents a common real-world agent interaction pattern with realistic timing baked in.

## Available Scenarios

### 1. Simple Response (`withSimpleResponseScenario`)

**Pattern**: User asks → Agent thinks → Agent responds with text

Simplest scenario showing basic thinking and text response with no tool calls.

```tsx
export const SimpleQuery: Story = {
  decorators: [withSimpleResponseScenario],
  parameters: {
    simpleResponseScenario: {
      userMessage: 'What is React?',
      thinkingText: 'Let me explain React and its key concepts...',
      responseText: 'React is a JavaScript library for building user interfaces...',
    },
    mockKartonState: { /* base state */ }
  }
};
```

**Configuration**:
- `userMessage`: User's question/request
- `thinkingText`: Agent's reasoning text
- `responseText`: Agent's final response
- `thinkingDuration?`: Custom thinking duration in ms (default: 2000-3000ms)
- `loop?`: Enable looping (default: false)

---

### 2. File Reading (`withFileReadingScenario`)

**Pattern**: User asks → Agent thinks → Agent reads file → Agent responds

Shows file exploration with read tool lifecycle (input-streaming → input-available → output-available).

```tsx
export const ReadFile: Story = {
  decorators: [withFileReadingScenario],
  parameters: {
    fileReadingScenario: {
      userMessage: 'What does the Button component do?',
      thinkingText: 'Let me read the Button component file...',
      targetFile: 'src/components/Button.tsx',
      fileContent: 'export const Button = ({ children, ...props }) => {...}',
      responseText: 'The Button component is a reusable button element that...',
    }
  }
};
```

**Configuration**:
- `userMessage`: User's question/request
- `thinkingText`: Agent's reasoning
- `targetFile`: Path of file to read
- `fileContent`: Content of the file
- `responseText`: Agent's analysis/response
- `thinkingDuration?`: Custom thinking duration
- `loop?`: Enable looping

---

### 3. File Edit (`withFileEditScenario`)

**Pattern**: User asks → Agent thinks → Agent edits file → Agent confirms

Shows file editing with content streaming and diff metadata.

```tsx
export const EditFile: Story = {
  decorators: [withFileEditScenario],
  parameters: {
    fileEditScenario: {
      userMessage: 'Add a loading state to the button',
      thinkingText: 'I need to add an isLoading prop and conditional rendering...',
      targetFile: 'src/components/Button.tsx',
      beforeContent: 'export const Button = ({ children }) => <button>{children}</button>',
      afterContent: 'export const Button = ({ children, isLoading }) => <button disabled={isLoading}>{isLoading ? "Loading..." : children}</button>',
      responseText: "I've added the loading state to your button component.",
    }
  }
};
```

**Configuration**:
- `userMessage`: User's edit request
- `thinkingText`: Agent's planning
- `targetFile`: File to edit
- `beforeContent`: Original file content
- `afterContent`: New file content
- `responseText`: Confirmation message
- `thinkingDuration?`: Custom thinking duration
- `loop?`: Enable looping

---

### 4. Multi-File Edit (`withMultiFileEditScenario`)

**Pattern**: User asks → Agent thinks → Agent edits 3-4 files in parallel → Agent confirms

Demonstrates parallel tool execution with multiple files being edited simultaneously.

```tsx
export const EditMultipleFiles: Story = {
  decorators: [withMultiFileEditScenario],
  parameters: {
    multiFileEditScenario: {
      userMessage: 'Refactor all button components',
      thinkingText: 'I need to update the API across all button variants...',
      files: [
        {
          path: 'src/components/Button.tsx',
          beforeContent: '...',
          afterContent: '...',
        },
        {
          path: 'src/components/IconButton.tsx',
          beforeContent: '...',
          afterContent: '...',
        },
        {
          path: 'src/components/LinkButton.tsx',
          beforeContent: '...',
          afterContent: '...',
        },
      ],
      responseText: "I've updated all three button components with the new API.",
    }
  }
};
```

**Configuration**:
- `userMessage`: User's request
- `thinkingText`: Agent's plan
- `files`: Array of file edit operations
  - `path`: File path
  - `beforeContent`: Original content
  - `afterContent`: New content
- `responseText`: Confirmation message
- `thinkingDuration?`: Custom thinking duration
- `loop?`: Enable looping

---

### 5. Parallel Exploration (`withExplorationScenario`)

**Pattern**: Complex multi-phase exploration and editing

1. User asks → Agent thinks
2. Agent calls list-files + glob in parallel → both complete
3. Agent calls 3x read-file in parallel → all complete
4. Agent responds with plan
5. Agent performs multi-edit + overwrite-file in parallel

Most complex scenario showing realistic exploration workflow.

```tsx
export const ExploreAndEdit: Story = {
  decorators: [withExplorationScenario],
  parameters: {
    explorationScenario: {
      userMessage: 'Find and fix all button components',
      thinkingText: 'Let me explore the component structure...',
      listFilesPath: 'src/components',
      listFilesResult: [
        { relativePath: 'Button.tsx', name: 'Button.tsx', type: 'file', depth: 0 },
        { relativePath: 'IconButton.tsx', name: 'IconButton.tsx', type: 'file', depth: 0 },
      ],
      globPattern: '**/*.tsx',
      globResult: ['Button.tsx', 'IconButton.tsx', 'LinkButton.tsx'],
      filesToRead: [
        { path: 'Button.tsx', content: '...' },
        { path: 'IconButton.tsx', content: '...' },
        { path: 'LinkButton.tsx', content: '...' },
      ],
      intermediateResponse: 'I found the issues. Let me fix them now.',
      edits: [
        {
          path: 'Button.tsx',
          beforeContent: '...',
          afterContent: '...',
          useMultiEdit: true,
        },
        {
          path: 'IconButton.tsx',
          beforeContent: '...',
          afterContent: '...',
        },
      ],
      finalResponse: 'All button components have been fixed.',
    }
  }
};
```

**Configuration**:
- `userMessage`: User's request
- `thinkingText`: Initial reasoning
- `listFilesPath`: Directory to list
- `listFilesResult`: Files found
- `globPattern`: Pattern to match
- `globResult`: Matched paths
- `filesToRead`: Array of 3 files to read
- `intermediateResponse`: Message after exploration
- `edits`: Array of file edits
  - `useMultiEdit?`: Use multi-edit vs overwrite
- `finalResponse?`: Optional completion message
- `loop?`: Enable looping

---

### 6. Error Recovery (`withErrorRecoveryScenario`)

**Pattern**: User asks → Agent thinks → Agent attempts edit → Tool fails → Agent explains

Shows error handling with output-error state.

```tsx
export const HandleError: Story = {
  decorators: [withErrorRecoveryScenario],
  parameters: {
    errorRecoveryScenario: {
      userMessage: 'Delete the config file',
      thinkingText: 'Let me remove that file...',
      attemptedFile: 'config/settings.json',
      attemptedContent: '',
      errorMessage: 'Permission denied: Cannot write to config directory',
      recoveryExplanation: 'I encountered an error. The config directory is read-only. You will need to manually delete this file with elevated permissions.',
    }
  }
};
```

**Configuration**:
- `userMessage`: User's request
- `thinkingText`: Agent's planning
- `attemptedFile`: File agent tries to modify
- `attemptedContent`: Content agent tries to write
- `errorMessage`: Error from tool
- `recoveryExplanation`: Agent's explanation
- `thinkingDuration?`: Custom thinking duration
- `loop?`: Enable looping

---

### 7. Complex Refactoring (`withComplexRefactoringScenario`)

**Pattern**: Multi-phase refactoring workflow

1. User asks → Agent thinks
2. Agent reads multiple files
3. Agent explains what it found
4. Agent performs initial edits
5. Agent explains next step
6. Agent performs final edit
7. Agent confirms completion

Shows sequential multi-phase operations.

```tsx
export const ComplexRefactor: Story = {
  decorators: [withComplexRefactoringScenario],
  parameters: {
    complexRefactoringScenario: {
      userMessage: 'Refactor the authentication system',
      phase1: {
        thinkingText: 'Let me analyze the authentication code...',
        filesToRead: [
          { path: 'auth/login.ts', content: '...' },
          { path: 'auth/register.ts', content: '...' },
        ],
      },
      phase2: {
        intermediateText: 'I found several issues. Let me fix them.',
        initialEdits: [
          { path: 'auth/login.ts', beforeContent: '...', afterContent: '...' },
          { path: 'auth/register.ts', beforeContent: '...', afterContent: '...' },
        ],
      },
      phase3: {
        followUpText: 'Now I need to update the types file.',
        finalEdit: {
          path: 'auth/types.ts',
          beforeContent: '...',
          afterContent: '...',
        },
        completionText: 'All authentication files have been refactored.',
      },
    }
  }
};
```

**Configuration**:
- `userMessage`: User's request
- `phase1`: Initial exploration
  - `thinkingText`: Reasoning
  - `filesToRead`: Files to analyze
- `phase2`: Initial fixes
  - `intermediateText`: Explanation
  - `initialEdits`: First batch of edits
- `phase3`: Follow-up work
  - `followUpText`: Next step explanation
  - `finalEdit`: Last edit
  - `completionText`: Completion message
- `loop?`: Enable looping

---

## Timing Configuration

All scenarios use realistic timing by default:

```typescript
REALISTIC_TIMING = {
  thinking: { min: 2000, max: 3000 },      // 2-3 seconds
  fileOperation: { min: 1000, max: 2000 }, // 1-2 seconds
  textStreaming: { intervalMs: 50 },       // 50ms per word
  toolInputStreaming: { intervalMs: 30 },  // 30ms per char
  phaseTransition: 300,                    // 300ms between states
}
```

You can customize thinking duration per scenario:

```tsx
parameters: {
  fileEditScenario: {
    // ...other config
    thinkingDuration: 1500, // Custom 1.5 second thinking time
  }
}
```

## Looping

By default, scenarios play once and stop. Enable looping per story:

```tsx
parameters: {
  simpleResponseScenario: {
    // ...other config
    loop: true, // Restart after completion with 1s pause
  }
}
```

## Base State

All scenarios accept `mockKartonState` in parameters for initial state:

```tsx
const baseState: Partial<AppState> = {
  workspace: {
    agent: { accessPath: '/path/to/project' },
    agentChat: {
      chats: {},
      activeChatId: 'streaming-chat',
      toolCallApprovalRequests: [],
      isWorking: false,
    },
  },
};

export const MyStory: Story = {
  decorators: [withFileEditScenario],
  parameters: {
    fileEditScenario: { /* config */ },
    mockKartonState: baseState, // Provide initial state
  }
};
```

## Migration from Old Decorators

If using `withStreamingMessage` or `withToolStreaming`:

### Before:
```tsx
export const OldStory: Story = {
  decorators: [withStreamingMessage, withToolStreaming, withMockKarton],
  parameters: {
    streamingConfig: { /* ... */ },
    toolStreamingConfig: { /* ... */ },
    mockKartonState: { /* ... */ },
  }
};
```

### After:
```tsx
export const NewStory: Story = {
  decorators: [withFileEditScenario], // Single decorator!
  parameters: {
    fileEditScenario: {
      userMessage: 'Edit the file',
      thinkingText: 'Planning the edit...',
      targetFile: 'Button.tsx',
      beforeContent: '...',
      afterContent: '...',
      responseText: 'Done!',
    },
    mockKartonState: { /* ... */ },
  }
};
```

Benefits:
- ✅ Single decorator (easier to use)
- ✅ Realistic timing automatic
- ✅ Full lifecycle simulation
- ✅ Self-documenting (decorator name describes flow)
- ✅ Minimal configuration

## Advanced Usage: Custom Timelines

For completely custom scenarios, use the `TimelineExecutor` directly:

```tsx
import { TimelineExecutor, type TimelineEvent } from './.storybook/decorators/scenarios';

const customTimeline: TimelineEvent[] = [
  { type: 'add-message', timestamp: 0, message: userMessage },
  { type: 'set-is-working', timestamp: 500, isWorking: true },
  // ... more events
];

const executor = new TimelineExecutor(
  customTimeline,
  initialState,
  (newState) => setState(newState)
);
executor.start();
```

## Best Practices

1. **Choose the right scenario**: Pick the scenario that matches your use case
2. **Provide realistic content**: Use actual file paths and code in examples
3. **Keep messages concise**: Focus on the key interactions
4. **Use looping for demos**: Enable `loop: true` for stakeholder presentations
5. **Combine with base state**: Provide realistic initial state for context

## Troubleshooting

**Issue**: Timeline doesn't start
- ✅ Ensure `mockKartonState` has `workspace.agentChat` structure
- ✅ Check browser console for errors

**Issue**: Timing feels wrong
- ✅ Adjust `thinkingDuration` for specific scenarios
- ✅ Remember: realistic timing means 2-3 seconds for thinking

**Issue**: Loop doesn't restart
- ✅ Verify `loop: true` in scenario config
- ✅ Check that scenario completes successfully

**Issue**: Content not streaming
- ✅ Ensure text/code content is non-empty
- ✅ Check that intervalMs is reasonable (50ms for text, 30ms for code)
