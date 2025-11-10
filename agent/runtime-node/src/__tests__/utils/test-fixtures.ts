import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Creates a temporary test directory with a unique name
 */
export function createTempDir(prefix = 'stagewise-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Creates a file with the given content
 */
export function createFile(
  basePath: string,
  relativePath: string,
  content: string,
): string {
  const fullPath = path.join(basePath, relativePath);
  const dir = path.dirname(fullPath);

  // Create parent directories if they don't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

/**
 * Creates a directory structure from a nested object
 * Example: { 'src': { 'index.ts': 'content', 'lib': { 'utils.ts': 'content' } } }
 */
export function createFileTree(
  basePath: string,
  structure: Record<string, string | Record<string, unknown>>,
): void {
  for (const [name, value] of Object.entries(structure)) {
    const fullPath = path.join(basePath, name);

    if (typeof value === 'string') {
      // It's a file
      createFile(basePath, name, value);
    } else if (typeof value === 'object' && value !== null) {
      // It's a directory
      fs.mkdirSync(fullPath, { recursive: true });
      createFileTree(
        fullPath,
        value as Record<string, string | Record<string, unknown>>,
      );
    }
  }
}

/**
 * Creates a binary file (with NUL bytes)
 */
export function createBinaryFile(
  basePath: string,
  relativePath: string,
  sizeInBytes = 1024,
): string {
  const fullPath = path.join(basePath, relativePath);
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create a buffer with random data and some NUL bytes
  const buffer = Buffer.alloc(sizeInBytes);
  for (let i = 0; i < sizeInBytes; i++) {
    // Mix in some NUL bytes
    buffer[i] = i % 10 === 0 ? 0 : Math.floor(Math.random() * 256);
  }

  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

/**
 * Creates a large file with the specified number of lines
 */
export function createLargeFile(
  basePath: string,
  relativePath: string,
  numLines: number,
  lineTemplate = 'This is line {line} of the test file with some content',
): string {
  const fullPath = path.join(basePath, relativePath);
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [];
  for (let i = 1; i <= numLines; i++) {
    lines.push(lineTemplate.replace('{line}', i.toString()));
  }

  fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
  return fullPath;
}

/**
 * Creates a .gitignore file with the given patterns
 */
export function createGitignore(basePath: string, patterns: string[]): string {
  return createFile(basePath, '.gitignore', patterns.join('\n'));
}

/**
 * Creates a realistic project structure with common patterns
 */
export function createRealisticProject(basePath: string): void {
  createFileTree(basePath, {
    '.gitignore': 'node_modules/\ndist/\n*.log\n.env',
    'package.json': JSON.stringify(
      {
        name: 'test-project',
        version: '1.0.0',
      },
      null,
      2,
    ),
    'README.md': '# Test Project\n\nThis is a test project for testing.',
    src: {
      'index.ts':
        'export function main() {\n  console.log("Hello World");\n}\n',
      'types.ts':
        'export interface User {\n  id: number;\n  name: string;\n}\n',
      lib: {
        'utils.ts':
          'export function isValidEmail(email: string): boolean {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}\n',
        'helpers.ts':
          'export function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}\n',
      },
      components: {
        'Button.tsx':
          'export const Button = ({ children }: { children: React.ReactNode }) => {\n  return <button>{children}</button>;\n};\n',
        'Input.tsx':
          'export const Input = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {\n  return <input value={value} onChange={(e) => onChange(e.target.value)} />;\n};\n',
      },
    },
    tests: {
      'utils.test.ts': 'import { isValidEmail } from "../src/lib/utils";\n',
      '.gitignore': 'coverage/',
    },
    docs: {
      'API.md': '# API Documentation\n\n## Functions\n\n### main()\n',
      'GUIDE.md': '# User Guide\n\n## Getting Started\n',
    },
    node_modules: {
      '.gitkeep': '',
    },
    dist: {
      'index.js': '// Built file',
    },
  });
}

/**
 * Removes a directory and all its contents recursively
 */
export function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Reads the contents of a file
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Checks if a file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Gets the file stats
 */
export function getFileStats(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}
