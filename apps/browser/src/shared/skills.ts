/**
 * Compatibility shim. The canonical skill types now live in
 * `@stagewise/agent-core/types`. This re-export preserves the
 * `@shared/skills` import path used throughout `apps/browser`.
 */
export type {
  SkillSource,
  SkillDefinition,
  SkillDefinitionUI,
} from '@stagewise/agent-core/types';
export { toSkillDefinitionUI } from '@stagewise/agent-core/types';
