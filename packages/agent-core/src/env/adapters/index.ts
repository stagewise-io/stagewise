/**
 * Core-owned {@link DomainAdapter} factories. Each builds an adapter
 * for one package-owned environment domain (`workspace`, `fileDiffs`,
 * `agentsMd`, `workspaceMd`, `enabledSkills`, `plans`, `logs`). Hosts
 * register their own adapters (e.g. `browser`, `shells`, `sandbox`)
 * directly on the {@link DomainAdapterRegistry}.
 *
 * Unlike the legacy `createCoreEnvAdapters()` factory, there is no
 * shared per-turn context object — every adapter pulls its slice
 * directly from the deps it captures in its closure.
 */
export {
  CORE_ENV_SCHEMA_VERSION,
  renderChangesXml,
  escAttr,
  escXml,
  type EnvironmentChangeEntry,
} from './shared';
export {
  createAgentsMdDomainAdapter,
  type AgentsMdDomainAdapterDeps,
} from './agents-md';
export {
  createEnabledSkillsDomainAdapter,
  type EnabledSkillsDomainAdapterDeps,
} from './enabled-skills';
export {
  createFileDiffsDomainAdapter,
  type FileDiffsDomainAdapterDeps,
} from './file-diffs';
export {
  createLogsDomainAdapter,
  type LogsDomainAdapterDeps,
} from './logs';
export {
  createPlansDomainAdapter,
  type PlansDomainAdapterDeps,
} from './plans';
export {
  createWorkspaceDomainAdapter,
  type WorkspaceDomainAdapterDeps,
} from './workspace';
export {
  createWorkspaceMdDomainAdapter,
  type WorkspaceMdDomainAdapterDeps,
} from './workspace-md';
