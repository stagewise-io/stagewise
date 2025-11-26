import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { type AppState, Layout, MainTab } from '@shared/karton-contracts/ui';
import {
  withSimpleResponseScenario,
  withFileReadingScenario,
  withFileEditScenario,
  withOverwriteFileScenario,
  withMultiFileEditScenario,
  withExplorationScenario,
  withErrorRecoveryScenario,
  withComplexRefactoringScenario,
} from '@sb/decorators/scenarios';
import { createEmptyChat } from '@sb/mocks/chat-data';

const meta: Meta<typeof ChatHistory> = {
  title: 'Chat/Agent/Scenarios/Agent Lifecycle',
  component: ChatHistory,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ChatHistory>;

// Base mock state for all stories
const baseState: Partial<AppState> = {
  workspace: {
    path: '/Users/user/projects/my-app',
    paths: {
      data: '/Users/user/projects/my-app/data',
      temp: '/Users/user/projects/my-app/temp',
    },
    devAppStatus: null,
    inspirationComponents: [],
    config: null,
    plugins: null,
    setupActive: false,
    rag: {
      lastIndexedAt: null,
      indexedFiles: 0,
      statusInfo: { isIndexing: false },
    },
    loadedOnStart: true,
    childWorkspacePaths: [],
    agent: {
      accessPath: '/Users/user/projects/my-app',
    },
    agentChat: {
      chats: {
        'streaming-chat': createEmptyChat(),
      },
      activeChatId: 'streaming-chat',
      toolCallApprovalRequests: [],
      isWorking: false,
    },
  },
  userExperience: {
    activeLayout: Layout.MAIN,
    activeMainTab: MainTab.DEV_APP_PREVIEW,
    devAppPreview: {
      isFullScreen: false,
      inShowCodeMode: false,
      customScreenSize: null,
    },
  },
};

/**
 * 1. Simple Response Scenario
 *
 * Basic thinking and text response without tools.
 * User asks → Agent thinks → Agent responds
 */
export const SimpleResponse: Story = {
  decorators: [withSimpleResponseScenario],
  parameters: {
    simpleResponseScenario: {
      userMessage: 'What is the difference between Props and State in React?',
      thinkingText:
        'Let me explain the key differences between Props and State in React components...',
      responseText:
        'Props are read-only data passed from parent to child components, while State is mutable data managed within a component. Props enable component composition, and State enables component interactivity. Props flow down the component tree, State stays local unless lifted up.',
    },
    mockKartonState: baseState,
  },
};

/**
 * 2. File Reading Scenario
 *
 * Agent explores code by reading a file.
 * User asks → Agent thinks → Reads file → Responds with analysis
 */
export const FileReading: Story = {
  decorators: [withFileReadingScenario],
  parameters: {
    fileReadingScenario: {
      userMessage: 'What does the Button component do?',
      thinkingText:
        'Let me read the Button component file to understand its implementation...',
      targetFile: 'src/components/Button.tsx',
      fileContent: `export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export const Button = ({ children, variant = 'primary', size = 'md', onClick }: ButtonProps) => {
  return (
    <button
      className={\`btn btn-\${variant} btn-\${size}\`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};`,
      responseText:
        'The Button component is a reusable UI element that accepts children, variant (primary/secondary/ghost), size (sm/md/lg), and an optional onClick handler. It applies appropriate CSS classes based on the variant and size props.',
    },
    mockKartonState: baseState,
  },
};

/**
 * 3. File Edit Scenario
 *
 * Agent makes changes to a single file.
 * User asks → Agent thinks → Edits file → Confirms
 */
export const FileEdit: Story = {
  decorators: [withFileEditScenario],
  parameters: {
    fileEditScenario: {
      userMessage: 'Add a loading state to the Button component',
      thinkingText:
        'I need to add an isLoading prop that disables the button and shows loading text...',
      targetFile: 'src/components/Button.tsx',
      beforeContent: `export const Button = ({ children, variant = 'primary', onClick }: ButtonProps) => {
  return (
    <button className={\`btn btn-\${variant}\`} onClick={onClick}>
      {children}
    </button>
  );
};`,
      afterContent: `export const Button = ({ children, variant = 'primary', onClick, isLoading }: ButtonProps) => {
  return (
    <button
      className={\`btn btn-\${variant}\`}
      onClick={onClick}
      disabled={isLoading}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
};`,
      responseText:
        "I've added the loading state to your Button component. The button now accepts an isLoading prop that disables it and displays 'Loading...' text.",
    },
    mockKartonState: baseState,
  },
};

/**
 * 4. Create File Scenario (Overwrite File Tool)
 *
 * Agent creates a new file with streaming content.
 * User asks → Agent thinks → Creates file with streamed content → Confirms
 */
export const CreateNewFile: Story = {
  decorators: [withOverwriteFileScenario],
  parameters: {
    overwriteFileScenario: {
      userMessage: 'Create a file called Haikus.md with 10 haikus about coding',
      thinkingText:
        'Let me compose some beautiful haikus about the art of programming and software development...',
      targetFile: 'Haikus.md',
      fileContent: `# Coding Haikus

A collection of haikus about the art of programming.

---

## 1. The Bug Hunt

Code runs perfectly
Until production deploys—
Then chaos ensues

## 2. Stack Overflow

Error message glows
Stack Overflow saves the day
Copy, paste, relief

## 3. Coffee-Driven Development

Morning coffee brews
Keyboard clicks fill empty space
Bugs become features

## 4. The Merge Conflict

Git merge goes sideways
Conflicts bloom like spring flowers
Resolve, commit, pray

## 5. Late Night Coding

Midnight code review
Eyes blur, logic starts to fade
Debug in the dawn

## 6. The Refactor

Old code, messy, crude
Refactor brings clarity
Tests still passing green

## 7. Deployment Day

Fingers hover, tense
Deploy button mocks my fear
Click—the world still spins

## 8. Documentation

Comments left behind
Future self will thank me now
Or curse my vague words

## 9. The Breakthrough

Stuck for hours, lost
Then suddenly—clarity!
Solution was simple

## 10. Code Poetry

Elegant design
Functions flow like poetry
Art meets engineering
`,
      responseText:
        "I've created Haikus.md with 10 beautiful haikus about coding. Each one captures a different aspect of the programming experience!",
    },
    mockKartonState: baseState,
  },
};

/**
 * 5. Multi-File Edit Scenario
 *
 * Agent edits multiple files in parallel.
 * User asks → Agent thinks → Edits 3 files simultaneously → Confirms
 */
export const MultiFileEdit: Story = {
  decorators: [withMultiFileEditScenario],
  parameters: {
    multiFileEditScenario: {
      userMessage: 'Add TypeScript strict mode to all button components',
      thinkingText:
        'I need to update all button variant files to use explicit types and remove any implicit any...',
      files: [
        {
          path: 'src/components/Button.tsx',
          beforeContent: 'export const Button = (props) => {...}',
          afterContent:
            'export const Button = (props: ButtonProps): JSX.Element => {...}',
        },
        {
          path: 'src/components/IconButton.tsx',
          beforeContent: 'export const IconButton = (props) => {...}',
          afterContent:
            'export const IconButton = (props: IconButtonProps): JSX.Element => {...}',
        },
        {
          path: 'src/components/LinkButton.tsx',
          beforeContent: 'export const LinkButton = (props) => {...}',
          afterContent:
            'export const LinkButton = (props: LinkButtonProps): JSX.Element => {...}',
        },
      ],
      responseText:
        "I've updated all three button components with explicit TypeScript types. They now have proper type annotations and return type declarations.",
    },
    mockKartonState: baseState,
  },
};

/**
 * 6. Parallel Exploration Scenario (Most Complex)
 *
 * Multi-phase workflow with parallel operations.
 * User asks → Agent thinks →
 * List files + Glob in parallel →
 * Read 3 files in parallel →
 * Agent explains plan →
 * Multi-edit + Overwrite in parallel
 */
export const ParallelExploration: Story = {
  decorators: [withExplorationScenario],
  parameters: {
    explorationScenario: {
      userMessage: 'Find and fix inconsistent button styling across components',
      thinkingText:
        'Let me explore the component directory to find all button-related files...',
      initialTool: {
        type: 'grep',
        query: 'className.*btn',
        result: {
          message: 'Found 3 matches for "className.*btn"',
          result: {
            totalMatches: 3,
            matches: [
              {
                relativePath: 'src/components/Button.tsx',
                line: 8,
                preview: '  <button className="btn-primary">',
              },
              {
                relativePath: 'src/components/IconButton.tsx',
                line: 6,
                preview: '  <button className="icon-btn-primary">',
              },
              {
                relativePath: 'src/components/LinkButton.tsx',
                line: 4,
                preview: '  <button className="link-button">',
              },
            ],
          },
        },
      },
      listFilesPath: 'src/components',
      listFilesResult: [
        {
          relativePath: 'src/components/Button.tsx',
          name: 'Button.tsx',
          type: 'file' as const,
          depth: 0,
        },
        {
          relativePath: 'src/components/IconButton.tsx',
          name: 'IconButton.tsx',
          type: 'file' as const,
          depth: 0,
        },
        {
          relativePath: 'src/components/LinkButton.tsx',
          name: 'LinkButton.tsx',
          type: 'file' as const,
          depth: 0,
        },
      ],
      globPattern: '**/*Button*.tsx',
      globResult: [
        'src/components/Button.tsx',
        'src/components/IconButton.tsx',
        'src/components/LinkButton.tsx',
      ],
      filesToRead: [
        {
          path: 'src/components/Button.tsx',
          content:
            'export const Button = () => <button className="btn-primary">...</button>',
        },
        {
          path: 'src/components/IconButton.tsx',
          content:
            'export const IconButton = () => <button className="icon-btn-primary">...</button>',
        },
        {
          path: 'src/components/LinkButton.tsx',
          content:
            'export const LinkButton = () => <button className="link-button">...</button>',
        },
      ],
      intermediateResponse:
        'I found inconsistent class naming. Button uses "btn-primary", IconButton uses "icon-btn-primary", and LinkButton uses "link-button". I will standardize them all to use the "btn-" prefix.',
      edits: [
        {
          path: 'src/components/IconButton.tsx',
          beforeContent:
            'export const IconButton = () => <button className="icon-btn-primary">...</button>',
          afterContent:
            'export const IconButton = () => <button className="btn-icon-primary">...</button>',
          useMultiEdit: true,
        },
        {
          path: 'src/components/LinkButton.tsx',
          beforeContent:
            'export const LinkButton = () => <button className="link-button">...</button>',
          afterContent:
            'export const LinkButton = () => <button className="btn-link">...</button>',
        },
      ],
      finalResponse:
        'All button components now use consistent "btn-" class name prefixes.',
    },
    mockKartonState: baseState,
  },
};

/**
 * 7. Error Recovery Scenario
 *
 * Agent encounters and handles an error gracefully.
 * User asks → Agent thinks → Attempts operation → Fails → Explains error
 */
export const ErrorRecovery: Story = {
  decorators: [withErrorRecoveryScenario],
  parameters: {
    errorRecoveryScenario: {
      userMessage: 'Delete the old config file at config/deprecated.json',
      thinkingText: 'Let me remove that deprecated configuration file...',
      attemptedFile: 'config/deprecated.json',
      attemptedContent: '',
      errorMessage:
        "EACCES: permission denied, unlink 'config/deprecated.json'",
      recoveryExplanation:
        'I encountered a permission error while trying to delete the file. The config directory appears to be read-only. You will need to manually delete this file with elevated permissions or check your filesystem permissions.',
    },
    mockKartonState: baseState,
  },
};

/**
 * 8. Complex Refactoring Scenario
 *
 * Multi-phase sequential refactoring.
 * User asks → Think → Read files → Explain → Initial edits → Explain next step → Final edit → Complete
 */
export const ComplexRefactoring: Story = {
  decorators: [withComplexRefactoringScenario],
  parameters: {
    complexRefactoringScenario: {
      userMessage:
        'Refactor the form validation system to use a centralized validator',
      phase1: {
        thinkingText:
          'Let me analyze the current validation implementation across the form components...',
        filesToRead: [
          {
            path: 'src/forms/LoginForm.tsx',
            content:
              'const validateEmail = (email) => /^[^@]+@[^@]+$/.test(email);',
          },
          {
            path: 'src/forms/RegisterForm.tsx',
            content: 'const validateEmail = (email) => email.includes("@");',
          },
        ],
      },
      phase2: {
        intermediateText:
          'I found duplicate and inconsistent email validation. Let me create a shared validator and update both forms to use it.',
        initialEdits: [
          {
            path: 'src/forms/LoginForm.tsx',
            beforeContent:
              'const validateEmail = (email) => /^[^@]+@[^@]+$/.test(email);',
            afterContent:
              'import { validateEmail } from "../utils/validators";',
          },
          {
            path: 'src/forms/RegisterForm.tsx',
            beforeContent:
              'const validateEmail = (email) => email.includes("@");',
            afterContent:
              'import { validateEmail } from "../utils/validators";',
          },
        ],
      },
      phase3: {
        followUpText:
          'Now I need to create the centralized validators file with the proper validation logic.',
        finalEdit: {
          path: 'src/utils/validators.ts',
          beforeContent: '// Empty file',
          afterContent: `export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};`,
        },
        completionText:
          'All validation logic has been centralized. Both LoginForm and RegisterForm now use the shared validators from utils/validators.ts.',
      },
    },
    mockKartonState: baseState,
  },
};
