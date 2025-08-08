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
    'tsconfig.json',
  );
  if (!configFilePath) {
    throw new Error('tsconfig.json not found');
  }

  const configFile = ts.readConfigFile(configFilePath, ts.sys.readFile);
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
    // Resolve path aliases during compilation
    baseUrl: parsedConfig.options.baseUrl || process.cwd(),
    paths: parsedConfig.options.paths || {},
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };

  // Include vite-env.d.ts to provide build-time constant declarations
  const viteEnvPath = path.resolve(process.cwd(), 'src/vite-env.d.ts');
  const programFiles = [...absoluteFilePaths, viteEnvPath];

  const program = ts.createProgram(programFiles, options);
  const emitResult = program.emit(
    undefined,
    (fileName, data, writeByteOrderMark, _onError, sourceFiles) => {
      const sourceFile = sourceFiles?.[0];
      if (sourceFile) {
        const sourceFileName = sourceFile.fileName;
        const mappedOutputName = resolvedFiles[sourceFileName];

        if (mappedOutputName) {
          const newFileName = path.join(
            absoluteOutDir,
            `${mappedOutputName}.d.ts`,
          );
          ts.sys.writeFile(newFileName, data, writeByteOrderMark);
        } else {
          ts.sys.writeFile(fileName, data, writeByteOrderMark);
        }
      } else {
        ts.sys.writeFile(fileName, data, writeByteOrderMark);
      }
    },
  );

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  if (allDiagnostics.length > 0) {
    const diagnosticHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    const message = ts.formatDiagnosticsWithColorAndContext(
      allDiagnostics,
      diagnosticHost,
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
