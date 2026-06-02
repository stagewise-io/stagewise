import { z } from 'zod';

/** Controls whether tool calls (shell, sandbox) require user approval */
export const toolApprovalModeSchema = z.enum([
  'alwaysAsk',
  'alwaysAllow',
  'smart',
]);
export type ToolApprovalMode = z.infer<typeof toolApprovalModeSchema>;

/**
 * Safe default for new agents and corrupted / missing DB rows. Centralizes
 * the fallback so it can't silently drift across backend, UI, and
 * persistence schema.
 *
 * Historical SQL defaults in migrations intentionally inline the string
 * value (`alwaysAsk`) for replay stability — do not retrofit migrations
 * to use this constant.
 */
export const DEFAULT_TOOL_APPROVAL_MODE: ToolApprovalMode = 'alwaysAsk';
