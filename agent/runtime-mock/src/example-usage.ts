/**
 * Example usage of MockFileSystem for testing client runtime functions
 *
 * This file demonstrates how to use the MockFileSystem to test functions
 * that depend on file system operations, like get-project-path.ts
 *
 * All examples use the basic ClientRuntimeMock constructor with DirectoryJSON
 * to create mock file systems for testing.
 */

import { ClientRuntimeMock, type DirectoryJSON } from './index.js';

// Example: Testing get-project-path function (hypothetical import)
// import { getProjectPath } from '@stagewise/client-prompt-snippets';

/**
 * Example 1: Basic usage with manual file setup
 */
async function example1_BasicUsage() {
  console.log('\n=== Example 1: Basic Usage with DirectoryJSON ===');

  // Create a mock file system using DirectoryJSON format
  const initialFiles: DirectoryJSON = {
    'package.json': JSON.stringify(
      {
        name: 'my-test-project',
        version: '1.0.0',
      },
      null,
      2,
    ),
    'src/index.ts': 'console.log("Hello world");',
    'src/utils/': null, // null = empty directory
    'README.md': '# My Test Project\n\nThis is a test project.',
  };

  const mockRuntime = new ClientRuntimeMock({
    workingDirectory: '/my-project',
    initialFiles,
    rgBinaryBasePath: '',
  });

  // Test that we can read files
  const packageResult = await mockRuntime.fileSystem.readFile('package.json');
  console.log('✅ Package.json read successfully:', packageResult.success);

  // Test current working directory
  const cwd = mockRuntime.fileSystem.getCurrentWorkingDirectory();
  console.log('📁 Current working directory:', cwd);

  // Example of how you would test getProjectPath
  // const projectPathSnippet = await getProjectPath(mockRuntime);
  // console.log('🎯 Project path snippet:', projectPathSnippet);
}

/**
 * Example 2: Complex setup with DirectoryJSON
 */
async function example2_ComplexSetup() {
  console.log('\n=== Example 2: Complex Setup with DirectoryJSON ===');

  // Create a complex project structure using DirectoryJSON
  const complexFiles: DirectoryJSON = {
    'package.json': JSON.stringify(
      {
        name: 'complex-project',
        scripts: {
          build: 'tsc',
          test: 'jest',
        },
      },
      null,
      2,
    ),
    'src/main.ts': 'export function main() { return "Hello"; }',
    'src/utils/helper.ts': 'export function helper() { return "world"; }',
    'tests/main.test.ts': 'import { main } from "../src/main";',
    'dist/': null, // Empty directory
    'node_modules/': null, // Empty directory
    '.gitignore': 'node_modules/\ndist/\n*.log',
  };

  const mockRuntime = new ClientRuntimeMock({
    workingDirectory: '/complex-project',
    initialFiles: complexFiles,
    rgBinaryBasePath: '',
  });

  // Test file listing
  const listResult = await mockRuntime.fileSystem.listDirectory('.', {
    recursive: true,
    includeFiles: true,
    includeDirectories: true,
  });

  console.log('📂 Files in project:');
  listResult.files?.forEach((file) => {
    const indent = '  '.repeat(file.depth);
    const icon = file.type === 'directory' ? '📁' : '📄';
    console.log(`${indent}${icon} ${file.name}`);
  });
}

/**
 * Example 3: Creating project structures manually
 */
async function example3_ProjectStructures() {
  console.log('\n=== Example 3: Project Structures ===');

  // Create a Node.js project structure
  const nodeFiles: DirectoryJSON = {
    'package.json': JSON.stringify(
      {
        name: 'my-node-app',
        version: '1.0.0',
        scripts: {
          build: 'tsc',
          start: 'node dist/server.js',
          dev: 'ts-node src/server.ts',
        },
        dependencies: {
          express: '^4.18.0',
        },
        devDependencies: {
          '@types/node': '^18.0.0',
          typescript: '^4.9.0',
          'ts-node': '^10.9.0',
        },
      },
      null,
      2,
    ),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          outDir: './dist',
          rootDir: './src',
          strict: true,
        },
      },
      null,
      2,
    ),
    'src/server.ts':
      'import express from "express";\n\nconst app = express();\napp.listen(3000);',
    'src/routes/api.ts': 'export const apiRoutes = {};',
    'dist/': null, // Empty directory
  };

  const nodeRuntime = new ClientRuntimeMock({
    workingDirectory: '/my-node-app',
    initialFiles: nodeFiles,
    rgBinaryBasePath: '',
  });

  console.log('🟢 Node.js project created');
  console.log(
    '📁 Working directory:',
    nodeRuntime.fileSystem.getCurrentWorkingDirectory(),
  );

  // Test specific Node.js features
  const hasPackageJson =
    await nodeRuntime.fileSystem.fileExists('package.json');
  const hasTsConfig = await nodeRuntime.fileSystem.fileExists('tsconfig.json');
  console.log('✅ Has package.json:', hasPackageJson);
  console.log('✅ Has tsconfig.json:', hasTsConfig);

  // Create a React project structure
  const reactFiles: DirectoryJSON = {
    'package.json': JSON.stringify(
      {
        name: 'my-react-app',
        version: '0.1.0',
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          '@types/react': '^18.0.0',
          '@types/react-dom': '^18.0.0',
          typescript: '^4.9.0',
          vite: '^4.0.0',
        },
        scripts: {
          dev: 'vite',
          build: 'vite build',
        },
      },
      null,
      2,
    ),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          lib: ['DOM', 'DOM.Iterable', 'ES6'],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: false,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: 'ESNext',
          moduleResolution: 'Node',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'src/App.tsx':
      'import React from "react";\nimport { Header } from "./components/Header";\n\nfunction App() {\n  return (\n    <div>\n      <Header />\n      <main>Welcome to my React app!</main>\n    </div>\n  );\n}\n\nexport default App;',
    'src/components/Header.tsx':
      'export const Header = () => <header>My App</header>;',
    'src/main.tsx':
      'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',
    'index.html':
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>My React App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>',
  };

  const reactRuntime = new ClientRuntimeMock({
    workingDirectory: '/my-react-app',
    initialFiles: reactFiles,
    rgBinaryBasePath: '',
  });

  console.log('⚛️ React project created');
  const hasAppTsx = await reactRuntime.fileSystem.fileExists('src/App.tsx');
  console.log('✅ Has App.tsx:', hasAppTsx);
}

/**
 * Example 5: Testing search and file operations
 */
async function example5_SearchOperations() {
  console.log('\n=== Example 5: Search Operations ===');

  const mockRuntime = new ClientRuntimeMock({
    workingDirectory: '/search-test',
    rgBinaryBasePath: '',
    initialFiles: {
      'src/utils/logger.ts':
        'export function log(message: string) {\n  console.log(message);\n}',
      'src/services/api.ts':
        'import { log } from "../utils/logger";\n\nexport function callApi() {\n  log("API called");\n}',
      'tests/logger.test.ts':
        'import { log } from "../src/utils/logger";\n\ntest("log works", () => {\n  log("test");\n});',
    },
  });

  // Test grep functionality
  const grepResult = await mockRuntime.fileSystem.grep('.', 'log', {
    recursive: true,
    filePattern: '*.ts',
    caseSensitive: false,
  });

  console.log('🔍 Grep results for "log":');
  console.log(
    `Found ${grepResult.totalMatches} matches in ${grepResult.filesSearched} files`,
  );

  grepResult.matches?.forEach((match) => {
    console.log(
      `  📄 ${match.relativePath}:${match.line}:${match.column} - "${match.match}"`,
    );
    console.log(`     Preview: ${match.preview}`);
  });

  // Test glob functionality
  const globResult = await mockRuntime.fileSystem.glob('**/*.ts');
  console.log('\n🌐 Glob results for "**/*.ts":');
  globResult.relativePaths?.forEach((path) => {
    console.log(`  📄 ${path}`);
  });
}

/**
 * Example 6: Simulating a real test for get-project-path
 */
async function example6_GetProjectPathTest() {
  console.log('\n=== Example 6: Testing get-project-path Function ===');

  // This is how you would actually test the get-project-path function
  const testScenarios = [
    {
      name: 'Node.js project',
      runtime: new ClientRuntimeMock({
        workingDirectory: '/test',
        rgBinaryBasePath: '',
        initialFiles: {
          'package.json': JSON.stringify(
            {
              name: 'test-node-project',
              version: '1.0.0',
              scripts: {
                build: 'tsc',
                start: 'node dist/index.js',
              },
            },
            null,
            2,
          ),
          'tsconfig.json': JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                outDir: './dist',
                rootDir: './src',
                strict: true,
              },
            },
            null,
            2,
          ),
          'src/index.ts': 'console.log("Hello Node.js");',
        },
      }),
      expectedPath: '/test',
    },
    {
      name: 'React project',
      runtime: new ClientRuntimeMock({
        workingDirectory: '/test',
        rgBinaryBasePath: '',
        initialFiles: {
          'package.json': JSON.stringify(
            {
              name: 'test-react-project',
              version: '0.1.0',
              dependencies: {
                react: '^18.2.0',
                'react-dom': '^18.2.0',
              },
            },
            null,
            2,
          ),
          'src/App.tsx':
            'import React from "react";\n\nfunction App() {\n  return <div>Hello React</div>;\n}\n\nexport default App;',
          'src/main.tsx':
            'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";',
          'index.html':
            '<!DOCTYPE html>\n<html>\n<head><title>React App</title></head>\n<body><div id="root"></div></body>\n</html>',
        },
      }),
      expectedPath: '/test',
    },
    {
      name: 'Custom project',
      runtime: new ClientRuntimeMock({
        workingDirectory: '/custom/project/path',
        rgBinaryBasePath: '',
        initialFiles: {
          'main.py': 'print("Hello Python")',
        },
      }),
      expectedPath: '/custom/project/path',
    },
  ];

  for (const scenario of testScenarios) {
    console.log(`\n🧪 Testing ${scenario.name}:`);

    // This is how you would call the actual function:
    /*
    try {
      const result = await getProjectPath(scenario.runtime);
      console.log('✅ Project path result:', result);
      
      if (result.content === scenario.expectedPath) {
        console.log('✅ Test passed: Path matches expected value');
      } else {
        console.log('❌ Test failed: Path mismatch');
        console.log(`   Expected: ${scenario.expectedPath}`);
        console.log(`   Actual: ${result.content}`);
      }
    } catch (error) {
      console.log('❌ Test failed with error:', error);
    }
    */

    // For demonstration, we'll just show what the getCurrentWorkingDirectory returns
    const actualPath = scenario.runtime.fileSystem.getCurrentWorkingDirectory();
    console.log(`📁 Actual working directory: ${actualPath}`);
    console.log(`🎯 Expected path: ${scenario.expectedPath}`);
    console.log(
      actualPath === scenario.expectedPath ? '✅ Match!' : '❌ No match',
    );
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 Running MockFileSystem Examples\n');

  try {
    await example1_BasicUsage();
    await example2_ComplexSetup();
    await example3_ProjectStructures();
    await example5_SearchOperations();
    await example6_GetProjectPathTest();

    console.log('\n🎉 All examples completed successfully!');
  } catch (error) {
    console.error('💥 Example failed:', error);
  }
}

// Export for use in tests or run directly
export {
  example1_BasicUsage,
  example2_ComplexSetup,
  example3_ProjectStructures,
  example5_SearchOperations,
  example6_GetProjectPathTest,
  runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}
