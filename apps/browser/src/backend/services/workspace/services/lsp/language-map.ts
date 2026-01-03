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
