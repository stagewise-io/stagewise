/**
 * Get the LSP language ID for a file path
 *
 * Most language IDs are just the file extension without the dot.
 * Special cases are handled explicitly.
 */
export function getLanguageId(filePath: string): string {
  const ext = getExtension(filePath);

  // Special cases where language ID differs from extension
  switch (ext) {
    case '.tsx':
      return 'typescriptreact';
    case '.jsx':
      return 'javascriptreact';
    case '.yml':
      return 'yaml';
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.rs':
      return 'rust';
    case '.c':
    case '.h':
      return 'c';
    case '.cc':
    case '.cpp':
    case '.cxx':
    case '.c++':
    case '.hpp':
    case '.hh':
    case '.hxx':
    case '.h++':
      return 'cpp';
    default:
      // Remove the dot: .ts → typescript, .json → json, etc.
      return ext ? ext.slice(1) : 'plaintext';
  }
}

/**
 * Get the file extension (including the dot)
 */
export function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\'),
  );

  if (lastDot === -1 || lastDot < lastSlash) {
    return '';
  }
  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Extensions handled by TypeScript language server
 */
export const TYPESCRIPT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
];

/**
 * Extensions handled by ESLint
 */
export const ESLINT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
];

/**
 * Extensions handled by Biome
 */
export const BIOME_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
];

/**
 * Extensions handled by clangd (C/C++).
 *
 * clangd re-derives the true language from compile flags / compile_commands;
 * these IDs only route files to the server.
 */
export const CLANGD_EXTENSIONS = [
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.c++',
  '.h',
  '.hh',
  '.hpp',
  '.hxx',
  '.h++',
];

/**
 * Extensions handled by rust-analyzer.
 */
export const RUST_EXTENSIONS = ['.rs'];
