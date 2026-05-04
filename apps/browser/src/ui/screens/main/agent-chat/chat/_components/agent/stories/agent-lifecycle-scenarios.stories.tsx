import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import type { AppState } from '@shared/karton-contracts/ui';
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
import { createDefaultAgentState } from '@sb/decorators/scenarios/shared-utilities';
import { availableModels } from '@shared/available-models';

const meta: Meta<typeof ChatHistory> = {
  title: 'Chat/Agent/Scenarios/Agent Lifecycle',
  component: ChatHistory,
  tags: ['autodocs'],
  decorators: [
    // Virtuoso requires a container with defined height to calculate viewport
    (Story) => (
      <div style={{ height: '100vh', minHeight: '400px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChatHistory>;

// Base mock state for all stories
// Scenario decorators handle agent state internally, so we only need workspace config
const baseState: Partial<AppState> = {
  ...createDefaultAgentState({
    activeModelId: availableModels[0]?.modelId,
  }),
  userExperience: {
    storedExperienceData: {
      recentlyOpenedWorkspaces: [],
      hasSeenOnboardingFlow: false,
      lastViewedChats: {},
    },
    pendingOnboardingSuggestion: null,
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
        "Let me explain the key differences between Props and State in React components. First, I need to read the React documentation to understand the concepts. Then, I can explain the differences.\n\nI think that I already know the answer, but I want to be sure. So, if a prop is passed to a component, it is read-only and cannot be changed by the component. If a state is changed, the component will re-render with the new state.\n\nLet me think through some concrete examples. When a parent component passes a prop to a child, that prop is immutable from the child's perspective. The child can only read it and use it to render or pass it further down the component tree. Any attempt to modify a prop directly would violate React's unidirectional data flow pattern.\n\nState, on the other hand, is managed within a component using hooks like useState. When state changes, React automatically re-renders that component and its children with the new values. This is how components become interactive - users can click buttons, fill forms, and trigger state updates that cause the UI to update.\n\nAnother key difference is the source of truth. Props come from outside the component, so the parent is the source of truth for prop values. State is owned by the component itself, making the component the source of truth for state values. This is important for understanding data flow in React applications.\n\nI should also mention that props are useful for customizing component behavior and appearance, while state is used for tracking user interactions and internal component logic. Props enable component reusability and composition, while state enables component interactivity and responsiveness.",
      responseText:
        'Props are read-only data passed from parent to child components, while State is mutable data managed within a component. Props enable component composition, and State enables component interactivity. Props flow down the component tree, State stays local unless lifted up.',
    },
    mockKartonState: baseState,
  },
};

/**
 * 1b. Long Response Auto-Scroll Scenario
 *
 * Tests the auto-scroll behavior with a constrained height container.
 * Short reasoning → Long streaming text response that overflows and triggers auto-scroll.
 */
export const LongResponseAutoScroll: Story = {
  decorators: [
    // Wrapper decorator to constrain height and show scroll behavior
    // Uses flex with min-h-0 + h-full to ensure ChatHistory's h-full resolves correctly
    (Story) => (
      <div
        className="flex flex-col overflow-hidden rounded-lg border border-border"
        style={{ height: '400px' }}
      >
        <div className="h-full min-h-0 flex-1">
          <Story />
        </div>
      </div>
    ),
    withSimpleResponseScenario,
  ],
  parameters: {
    simpleResponseScenario: {
      userMessage:
        'Give me a comprehensive guide to building accessible web applications.',
      thinkingText:
        'Let me provide a detailed guide on web accessibility best practices...',
      thinkingDuration: 1500, // Short thinking time
      responseText: `# Comprehensive Guide to Building Accessible Web Applications

Accessibility (often abbreviated as a11y) is the practice of making your websites and applications usable by as many people as possible. This includes users with disabilities, users on slow connections, and users with older devices.

## 1. Semantic HTML

The foundation of accessibility starts with semantic HTML. Using the right HTML elements for their intended purpose provides built-in accessibility benefits.

### Headings
Use heading levels (h1-h6) hierarchically. Don't skip levels—go from h1 to h2, not h1 to h3. Each page should have exactly one h1 that describes the main content.

### Landmarks
Use semantic landmark elements like \`<header>\`, \`<nav>\`, \`<main>\`, \`<aside>\`, and \`<footer>\`. Screen readers can navigate between these landmarks, making it easier for users to find content.

### Lists
Use \`<ul>\`, \`<ol>\`, and \`<dl>\` for lists. Screen readers announce the number of items in a list, helping users understand the content structure.

## 2. Keyboard Navigation

All interactive elements must be keyboard accessible. Users should be able to navigate your entire application using only a keyboard.

### Focus Management
- Ensure all interactive elements can receive focus
- Use visible focus indicators (don't remove \`outline\` without providing an alternative)
- Manage focus when opening/closing modals and dialogs
- Use \`tabindex="0"\` to make non-interactive elements focusable when needed
- Avoid \`tabindex\` values greater than 0

### Skip Links
Provide "skip to main content" links at the top of pages so keyboard users can bypass repetitive navigation.

## 3. ARIA (Accessible Rich Internet Applications)

ARIA attributes provide additional context to assistive technologies when semantic HTML alone isn't sufficient.

### Common ARIA Attributes
- \`aria-label\`: Provides an accessible name for an element
- \`aria-labelledby\`: References another element that labels this one
- \`aria-describedby\`: References an element that describes this one
- \`aria-hidden="true"\`: Hides content from assistive technologies
- \`aria-live\`: Announces dynamic content changes

### ARIA Roles
Use roles sparingly—prefer semantic HTML. Common roles include:
- \`role="button"\` for elements that act as buttons but aren't \`<button>\`
- \`role="alert"\` for important messages
- \`role="dialog"\` for modal dialogs

**Remember the first rule of ARIA: Don't use ARIA if you can use semantic HTML instead.**

## 4. Color and Contrast

Visual design significantly impacts accessibility.

### Contrast Ratios
- Regular text: minimum 4.5:1 contrast ratio
- Large text (18pt+ or 14pt+ bold): minimum 3:1 contrast ratio
- UI components and graphics: minimum 3:1 contrast ratio

### Don't Rely on Color Alone
Never use color as the only way to convey information. Add text labels, icons, or patterns to ensure colorblind users can understand the content.

## 5. Images and Media

All non-text content needs text alternatives.

### Alt Text
- Provide descriptive alt text for informational images
- Use empty alt (\`alt=""\`) for decorative images
- For complex images (charts, diagrams), provide detailed descriptions

### Videos
- Include captions for all video content
- Provide audio descriptions for visual-only information
- Include transcripts for audio content

## 6. Forms

Forms are often the most challenging area for accessibility.

### Labels
Every form input must have an associated label. Use the \`<label>\` element with the \`for\` attribute matching the input's \`id\`.

### Error Handling
- Clearly identify errors in form submissions
- Provide helpful error messages near the relevant fields
- Use \`aria-invalid\` and \`aria-describedby\` to associate error messages with inputs

### Required Fields
- Indicate required fields visually and programmatically
- Use \`aria-required="true"\` or the HTML5 \`required\` attribute

## 7. Testing for Accessibility

Regular testing is essential for maintaining accessibility.

### Automated Testing
- Use tools like axe, WAVE, or Lighthouse
- Integrate accessibility checks into your CI/CD pipeline
- Note: Automated tools catch only about 30-40% of issues

### Manual Testing
- Navigate your entire app using only a keyboard
- Test with screen readers (VoiceOver, NVDA, JAWS)
- Test at various zoom levels (up to 200%)
- Disable CSS and verify content order makes sense

### User Testing
- Include users with disabilities in your testing process
- Conduct usability testing with assistive technologies

## 8. Common Patterns

### Modal Dialogs
- Trap focus within the modal when open
- Return focus to the trigger element when closed
- Close on Escape key press
- Use \`role="dialog"\` and \`aria-modal="true"\`

### Dropdown Menus
- Use \`aria-expanded\` to indicate open/closed state
- Use \`aria-haspopup\` to indicate menu presence
- Support arrow key navigation within the menu

### Tabs
- Use \`role="tablist"\`, \`role="tab"\`, and \`role="tabpanel"\`
- Support arrow key navigation between tabs
- Use \`aria-selected\` to indicate the active tab

## Conclusion

Building accessible applications benefits everyone, not just users with disabilities. It improves SEO, mobile usability, and overall user experience. Start with semantic HTML, test regularly, and continuously improve. Accessibility is not a one-time task but an ongoing commitment to inclusive design.

Remember: The web is for everyone. Let's build it that way.`,
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
      readDirectoryPath: 'src/components',
      readDirectoryContent: 'Button.tsx\nIconButton.tsx\nLinkButton.tsx',
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
