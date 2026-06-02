/**
 * `@stagewise/agent-core` mount-manager barrel.
 *
 * Public surface consumed by the host shell in
 * `apps/browser/.../services/toolbox/services/mount-manager/`.
 */
export {
  MountManager,
  mountPrefixForPath,
  type MountManagerOptions,
} from './mount-registry';
export {
  MentionSearchService,
  type MentionSearchContext,
  type MentionSearchClientRuntime,
  type MentionSearchToolboxState,
} from './mention-search';
export type { MountManagerHostHooks } from './types';
export { setAgentMounts } from './mount-state';
export { pickOwningWorkspace } from '../../workspace';
export * from './workspace-info';
