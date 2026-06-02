/**
 * Environment-state infrastructure for `@stagewise/agent-core`.
 *
 * Public surface is split by runtime safety:
 *   - This barrel: pure types, schemas, and the XML helpers used to render
 *     environment changes. Safe to import from UI / preload / renderer code.
 *   - `@stagewise/agent-core/env/adapters`: the seven core-owned `DomainAdapter`
 *     factory functions. Node-only — they transitively pull `chokidar` and
 *     `node:fs` via the `logs/read` and `plans/read` modules. Do not import
 *     from renderer-side code.
 */
export * from './contract';
export * from './permissions';
export * from './skills';
export * from './types';
export {
  CORE_ENV_SCHEMA_VERSION,
  renderChangesXml,
  escAttr,
  escXml,
  type EnvironmentChangeEntry,
} from './adapters/shared';
