import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  CodeBlock,
  lineAddedDiffMarker,
  lineRemovedDiffMarker,
  type CodeBlockTheme,
} from './code-block';
import type { BundledLanguage, ThemeRegistrationAny } from 'shiki';

// Import example theme JSONs for comparison
import ExampleThemeDark from '../../../../../../packages/stage-ui/src/code-block/example-theme-dark.json';
import ExampleThemeLight from '../../../../../../packages/stage-ui/src/code-block/example-theme-light.json';

// Create the example theme (falls back to dark for light if not defined)
const exampleTheme: CodeBlockTheme = {
  light: (Object.keys(ExampleThemeLight).length > 0
    ? ExampleThemeLight
    : ExampleThemeDark) as ThemeRegistrationAny,
  dark: ExampleThemeDark as ThemeRegistrationAny,
};

// =============================================================================
// Code Snippets
// =============================================================================

const typescriptCode = `interface Config<T extends Record<string, unknown>> {
  data: T;
  validate: (value: T) => boolean;
  transform?: (value: T) => T;
}

type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

async function fetchData<T>(url: string): Promise<Result<T>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('HTTP error');
    }
    const data: T = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// Type guard example
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
`;

const tsxCode = `import { useState, useCallback, type FC } from 'react';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  onClick?: () => void;
}

export const Button: FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    if (!isLoading && onClick) {
      onClick();
    }
  }, [isLoading, onClick]);

  return (
    <button
      className={\`btn btn-\${variant} btn-\${size}\`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        children
      )}
    </button>
  );
};`;

const javascriptClassCode = `class EventEmitter {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const callbacks = this.listeners.get(event);
    if (callbacks.length >= this.maxListeners) {
      console.warn(\`MaxListenersExceeded: \${event}\`);
    }
    callbacks.push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, ...args) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(...args));
  }
}

// Usage with inheritance
class Logger extends EventEmitter {
  log(message) {
    console.log(\`[LOG] \${message}\`);
    this.emit('log', { level: 'info', message });
  }
}`;

const cssCode = `:root {
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-background: #ffffff;
  --color-foreground: #1f2937;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  font-weight: 500;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: white;
  transition: all 150ms ease;
}

.button:hover {
  background-color: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .button {
    transition: none;
  }
}`;

const jsonCode = `{
  "name": "@stagewise/browser",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "biome check ."
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "shiki": "^1.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}`;

const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Theme Demo</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main id="app">
    <header class="header">
      <h1>Welcome</h1>
      <nav aria-label="Main navigation">
        <a href="/" class="nav-link">Home</a>
        <a href="/about" class="nav-link">About</a>
      </nav>
    </header>
    <section class="content">
      <article data-id="1">
        <p>Hello, <strong>World</strong>!</p>
      </article>
    </section>
  </main>
  <script type="module" src="/main.js"></script>
</body>
</html>`;

// Diff example using the stagewise diff markers
const diffCode = `interface UserProfile {
  id: string;
  name: string;
${lineRemovedDiffMarker}  email: string;
${lineAddedDiffMarker}  email: string | null;
${lineAddedDiffMarker}  emailVerified: boolean;
  createdAt: Date;
${lineRemovedDiffMarker}  role: string;
${lineAddedDiffMarker}  role: 'admin' | 'user' | 'guest';
${lineAddedDiffMarker}  permissions: string[];
}

function updateUser(user: UserProfile) {
${lineRemovedDiffMarker}  console.log('Updating user:', user.email);
${lineAddedDiffMarker}  if (!user.emailVerified) {
${lineAddedDiffMarker}    throw new Error('Email must be verified');
${lineAddedDiffMarker}  }
${lineAddedDiffMarker}  console.log('Updating verified user:', user.email);
  return saveToDatabase(user);
}`;

// =============================================================================
// Story Components
// =============================================================================

interface CodeBlockShowcaseProps {
  code: string;
  language: BundledLanguage;
  title: string;
  description?: string;
  compactDiff?: boolean;
  showComparison?: boolean;
}

const CodeBlockShowcase = ({
  code,
  language,
  title,
  description,
  compactDiff,
  showComparison = false,
}: CodeBlockShowcaseProps) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <span className="rounded bg-surface-1 px-2 py-0.5 font-mono text-muted-foreground text-xs">
          {language}
        </span>
      </div>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
      <div
        className={`grid gap-4 ${showComparison ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {/* Our theme */}
        <div className="flex flex-col gap-1">
          {showComparison && (
            <span className="font-medium text-muted-foreground text-xs">
              Our Theme
            </span>
          )}
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
            <CodeBlock
              code={code}
              language={language}
              className="p-0"
              compactDiff={compactDiff}
            />
          </div>
        </div>

        {/* Example theme (shown when comparison is enabled) */}
        {showComparison && (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-muted-foreground text-xs">
              Example Theme (One Dark Pro)
            </span>
            <div
              className="overflow-hidden rounded-lg border border-border"
              style={{
                backgroundColor: 'var(--example-syntax-editor-background)',
              }}
            >
              <CodeBlock
                code={code}
                language={language}
                className="p-0"
                compactDiff={compactDiff}
                theme={exampleTheme}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Toggle button component
const ComparisonToggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      enabled
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border bg-surface-1 text-muted-foreground hover:bg-surface-2'
    }`}
  >
    <span
      className={`h-2 w-2 rounded-full ${enabled ? 'bg-primary' : 'bg-muted-foreground'}`}
    />
    {enabled ? 'Comparison On' : 'Compare with Example'}
  </button>
);

const AllLanguagesShowcase = () => {
  const [showComparison, setShowComparison] = useState(false);

  const examples: Array<{
    code: string;
    language: BundledLanguage;
    title: string;
  }> = [
    { code: typescriptCode, language: 'ts', title: 'TypeScript' },
    { code: tsxCode, language: 'tsx', title: 'TSX / React' },
    { code: javascriptClassCode, language: 'javascript', title: 'JavaScript' },
    { code: cssCode, language: 'css', title: 'CSS' },
    { code: jsonCode, language: 'json', title: 'JSON' },
    { code: htmlCode, language: 'html', title: 'HTML' },
  ];

  return (
    <div className="flex flex-col gap-8 bg-background p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="mb-2 font-bold text-2xl text-foreground">
            Code Theme Showcase
          </h2>
          <p className="text-muted-foreground">
            Preview of syntax highlighting across different languages using the
            code theme.
          </p>
        </div>
        <ComparisonToggle
          enabled={showComparison}
          onToggle={() => setShowComparison(!showComparison)}
        />
      </div>
      <div className="grid gap-8">
        {examples.map(({ code, language, title }) => (
          <CodeBlockShowcase
            key={language}
            code={code}
            language={language}
            title={title}
            showComparison={showComparison}
          />
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// Story Definitions
// =============================================================================

const meta: Meta = {
  title: 'Components/CodeTheme',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj;

/**
 * Shows all supported languages in a grid layout.
 * Use the dark mode toggle to see both light and dark theme variants.
 */
export const AllLanguages: Story = {
  render: () => <AllLanguagesShowcase />,
};

// Wrapper for individual story pages with comparison toggle
const SingleLanguageShowcase = ({
  code,
  language,
  title,
  description,
  compactDiff,
}: Omit<CodeBlockShowcaseProps, 'showComparison'>) => {
  const [showComparison, setShowComparison] = useState(false);

  return (
    <div className="flex flex-col gap-4 bg-background p-6">
      <div className="flex justify-end">
        <ComparisonToggle
          enabled={showComparison}
          onToggle={() => setShowComparison(!showComparison)}
        />
      </div>
      <CodeBlockShowcase
        code={code}
        language={language}
        title={title}
        description={description}
        compactDiff={compactDiff}
        showComparison={showComparison}
      />
    </div>
  );
};

/**
 * TypeScript code with interfaces, generics, type guards, and async functions.
 */
export const TypeScript: Story = {
  render: () => (
    <SingleLanguageShowcase
      code={typescriptCode}
      language="typescript"
      title="TypeScript"
      description="Interfaces, generics, type guards, and async/await patterns."
    />
  ),
};

/**
 * TSX/JSX React component with hooks, props, and JSX syntax.
 */
export const TSXReact: Story = {
  name: 'TSX / React',
  render: () => (
    <SingleLanguageShowcase
      code={tsxCode}
      language="tsx"
      title="TSX / React Component"
      description="Functional component with useState, useCallback, and JSX elements."
    />
  ),
};

/**
 * JavaScript with ES6 classes, inheritance, and methods.
 */
export const JavaScriptClasses: Story = {
  name: 'JavaScript Classes',
  render: () => (
    <SingleLanguageShowcase
      code={javascriptClassCode}
      language="javascript"
      title="JavaScript with Classes"
      description="ES6 classes with constructor, methods, and inheritance."
    />
  ),
};

/**
 * CSS with custom properties, selectors, pseudo-classes, and media queries.
 */
export const CSS: Story = {
  render: () => (
    <SingleLanguageShowcase
      code={cssCode}
      language="css"
      title="CSS"
      description="CSS variables, selectors, pseudo-classes, and media queries."
    />
  ),
};

/**
 * JSON configuration file with nested objects and arrays.
 */
export const JsonConfig: Story = {
  name: 'JSON',
  render: () => (
    <SingleLanguageShowcase
      code={jsonCode}
      language="json"
      title="JSON"
      description="Package.json style configuration with nested structures."
    />
  ),
};

/**
 * HTML markup with semantic elements and attributes.
 */
export const HTML: Story = {
  render: () => (
    <SingleLanguageShowcase
      code={htmlCode}
      language="html"
      title="HTML"
      description="Semantic HTML with elements, attributes, and structure."
    />
  ),
};

/**
 * Code diff showing added and removed lines.
 * Uses the stagewise diff markers to highlight changes.
 */
export const DiffView: Story = {
  name: 'Diff View',
  render: () => (
    <SingleLanguageShowcase
      code={diffCode}
      language="typescript"
      title="Code Diff"
      description="Shows added (green) and removed (red) lines in a code change."
    />
  ),
};

/**
 * Compact diff view that collapses unchanged lines.
 * Useful for large files where only the changes matter.
 */
export const DiffViewCompact: Story = {
  name: 'Diff View (Compact)',
  render: () => (
    <SingleLanguageShowcase
      code={diffCode}
      language="typescript"
      title="Compact Diff"
      description="Collapsed diff view that hides unchanged lines for focus on changes."
      compactDiff
    />
  ),
};
