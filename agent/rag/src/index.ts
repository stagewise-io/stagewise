export const RAG_VERSION = 1;
export const EXPECTED_EMBEDDING_DIM = 3072;
export const LEVEL_DB_SCHEMA_VERSION = 1;

export { LevelDb } from './utils/typed-db.js';

export type { ComponentLibraryInformation } from './search-agents/search-components.js';
export type { StyleInformation } from './search-agents/search-styles.js';
export type { RouteMapping } from './search-agents/search-routes.js';

export * from './rag.js';
