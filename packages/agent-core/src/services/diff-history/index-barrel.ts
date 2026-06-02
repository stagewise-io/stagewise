/**
 * Re-export barrel for `@stagewise/agent-core/diff-history`.
 *
 * Using a secondary file (`index-barrel.ts`) so that the service
 * implementation file (`index.ts`) remains the primary package-internal
 * module and the public subpath export surface stays small and curated.
 */

export {
  DiffHistoryService,
  categorizeFanoutPath,
  type DiffHistoryServiceDeps,
  type FanoutPathCategory,
} from './index';

export { createEnvironmentDiffSnapshot } from './utils/diff';
