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
  AGENTS_MD_DOMAIN_ID,
  createAgentsMdDomainAdapter,
  type AgentsMdDomainAdapterDeps,
} from './agents-md';
export {
  ENABLED_SKILLS_DOMAIN_ID,
  createEnabledSkillsDomainAdapter,
  type EnabledSkillsDomainAdapterDeps,
} from './enabled-skills';
export {
  FILE_DIFFS_DOMAIN_ID,
  createFileDiffsDomainAdapter,
  type FileDiffsDomainAdapterDeps,
} from './file-diffs';
export {
  LOGS_DOMAIN_ID,
  createLogsDomainAdapter,
  type LogsDomainAdapterDeps,
} from './logs';
export {
  PLANS_DOMAIN_ID,
  createPlansDomainAdapter,
  type PlansDomainAdapterDeps,
} from './plans';
export {
  WORKSPACE_DOMAIN_ID,
  createWorkspaceDomainAdapter,
  type WorkspaceDomainAdapterDeps,
} from './workspace';
export {
  WORKSPACE_MD_DOMAIN_ID,
  createWorkspaceMdDomainAdapter,
  type WorkspaceMdDomainAdapterDeps,
} from './workspace-md';
