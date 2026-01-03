import type { LspServerInfo } from '../types';
import { typescriptServer } from './typescript';
import { eslintServer } from './eslint';
import { biomeServer } from './biome';

/**
 * Registry of all available LSP servers
 *
 * Order matters: servers are tried in order for each file.
 * Multiple servers can handle the same file (e.g., TypeScript + ESLint).
 */
export const servers: LspServerInfo[] = [
  // TypeScript/JavaScript support (types, completions, go-to-definition)
  typescriptServer,

  // ESLint (linting, code actions)
  eslintServer,

  // Biome (linting, formatting - alternative to ESLint/Prettier)
  biomeServer,
];

/**
 * Get all servers that can handle a file extension
 */
export function getServersForExtension(ext: string): LspServerInfo[] {
  return servers.filter((server) => server.extensions.includes(ext));
}

/**
 * Get a server by ID
 */
export function getServerById(id: string): LspServerInfo | undefined {
  return servers.find((server) => server.id === id);
}

/**
 * Get all server IDs
 */
export function getAllServerIds(): string[] {
  return servers.map((server) => server.id);
}

// Re-export individual servers for direct access
export { typescriptServer } from './typescript';
export { eslintServer } from './eslint';
export { biomeServer } from './biome';
