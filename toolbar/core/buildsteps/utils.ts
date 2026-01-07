import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export function generateDeclarationFile(
  files: Record<string, string>,
  outDir: string,
): void {
  const resolvedFiles = Object.fromEntries(
    Object.entries(files).map(([input, output]) => [
      path.resolve(input),
      output,
    ]),
  );
  const absoluteFilePaths = Object.keys(resolvedFiles);
  const absoluteOutDir = path.resolve(outDir);

  const configFilePath = ts.findConfigFile(
    process.cwd(),
    ts.sys.fileExists,
  );
  if (!configFilePath) {
    throw new Error('tsconfig.json not found');
  }

  const configFile = ts.readConfigFile(configFilePath, (path) => ts.sys.readFile(path) ?? '');
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configFilePath),
  );

  const options: ts.CompilerOptions = {
    ...parsedConfig.options,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: absoluteOutDir,
    noEmit: false,
  };

  // Include vite-env.d.ts to provide build-time constant declarations
  const viteEnvPath = path.resolve(process.cwd(), 'src/vite-env.d.ts');
  const programFiles = [...absoluteFilePaths, viteEnvPath];

  const program = ts.createProgram(programFiles, options);
  const emitResult = program.emit(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  // Filter out non-critical diagnostics (TS2742 - type inference warnings)
  const criticalDiagnostics = allDiagnostics.filter(
    (diagnostic) => diagnostic.code !== 2742,
  );

  if (criticalDiagnostics.length > 0) {
    const message = ts.formatDiagnostics(
      criticalDiagnostics,
      {
        getCanonicalFileName: (fileName: string) => fileName,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      },
    );
    console.error(message);
    throw new Error('Failed to generate declaration files.');
  }
}

export async function copyDtsFilesRecursive(
  sourceDir: string,
  destDir: string,
): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // If it's a directory, recurse into it
      await copyDtsFilesRecursive(sourcePath, destPath);
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      // If it's a .d.ts file, ensure its destination directory exists and then copy it
      await mkdir(destDir, { recursive: true }); // Ensure the parent dir exists
      await copyFile(sourcePath, destPath);
    }
    // All other files are ignored
  }
}
