/**
 * Compatibility shim. The canonical implementation now lives in
 * `@stagewise/agent-core/agents` as the named `specialTokens` export.
 * Kept here so existing `import specialTokens from './special-tokens'`
 * sites in the browser keep working while Phase 10 is in flight.
 */
import { specialTokens } from '@stagewise/agent-core/agents';

export default specialTokens;
