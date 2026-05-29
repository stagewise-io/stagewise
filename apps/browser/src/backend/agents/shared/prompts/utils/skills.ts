/**
 * Thin re-export of skill rendering helpers that now live in
 * `@stagewise/agent-core/env`. Shim only — imports across `apps/browser`
 * stay stable while the Phase 10 migration completes.
 */
export {
  renderAvailableSkillsList,
  type SkillInfo,
} from '@stagewise/agent-core/env';
