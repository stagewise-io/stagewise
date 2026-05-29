/**
 * @stagewise/agent-core
 *
 * Agent runtime, store, host seam, environment snapshot pipeline, universal
 * toolbox, diff-history, mount manager, persistence, and related services
 * for embedding in Node.js host applications (e.g. a desktop app or a CLI).
 */
export const AGENT_CORE_PACKAGE_VERSION = '0.0.0';

export * from './types';
export * from './store';
export * from './commands';
export * from './host';
export * from './services/mount-manager';
export * from './services/toolbox';
export * from './services/agent-manager';
export * from './env';
export * from './agents';
