import { rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Get the current directory (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const distPath = join(__dirname, 'dist');
const dependencyPath = join(
  __dirname,
  'node_modules/@stagewise/toolbar/dist/plugin-sdk',
);
const corePluginTypesPath = resolve(
  __dirname,
  '../core/src/plugin-sdk/plugin.ts',
);

console.log('🧹 Cleaning up existing dist folder...');
if (existsSync(distPath)) {
  rmSync(distPath, { recursive: true, force: true });
  console.log('✅ Existing dist folder removed');
} else {
  console.log('ℹ️  No existing dist folder found');
}

console.log('📦 Checking for dependency source...');
if (existsSync(dependencyPath)) {
  console.log('📁 Copying files from dependency to dist folder...');
  try {
    cpSync(dependencyPath, distPath, {
      recursive: true,
      force: true,
    });
    console.log('✅ Files copied successfully to dist folder');
    console.log('🎉 Build completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error copying files:', error);
    // Fall through to type generation fallback
  }
} else {
  console.log(`ℹ️  Dependency not found at: ${dependencyPath}`);
  console.log('➡️  Falling back to generating types from core sources');
}

// Fallback: generate dist/index.d.ts from core plugin types directly
try {
  if (!existsSync(corePluginTypesPath)) {
    console.error(`❌ Core plugin types not found at: ${corePluginTypesPath}`);
    console.error('Ensure toolbar/core exists in the workspace');
    process.exit(1);
  }

  const outDir = distPath;
  const program = ts.createProgram([corePluginTypesPath], {
    declaration: true,
    emitDeclarationOnly: true,
    outDir,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    baseUrl: __dirname,
    paths: {
      '@stagewise/karton-contract': [
        '../../packages/karton-contract/dist/index.d.ts',
      ],
    },
  });

  const emitResult = program.emit(undefined, (fileName, data) => {
    // Always write to dist/index.d.ts
    const newFileName = join(outDir, 'index.d.ts');
    ts.sys.writeFile(newFileName, data);
  });

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);
  if (diagnostics.length) {
    const host: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    throw new Error('Failed to generate declaration files');
  }

  console.log('✅ Types generated successfully to dist/index.d.ts');
  console.log('🎉 Build completed successfully!');
} catch (error) {
  console.error('❌ Error generating types from core sources:', error);
  process.exit(1);
}
