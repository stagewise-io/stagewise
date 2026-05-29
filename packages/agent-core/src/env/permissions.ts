/**
 * Permission constants for `Mount.permissions` values produced by
 * environment providers.
 *
 * These mirror the per-permission enum defined by `mountPermissionSchema`
 * in `./types.ts`. Kept here rather than in the types module so value
 * imports don't drag the full zod schema tree into consumers that only
 * need the constants.
 */
import type { MountPermission } from './types';

/** Read-only mount: agent can inspect but never mutate. */
export const READ_ONLY_PERMISSIONS: readonly MountPermission[] = [
  'read',
  'list',
] as const;

/** Full-access mount: agent can read, list, and mutate. */
export const FULL_PERMISSIONS: readonly MountPermission[] = [
  'read',
  'list',
  'create',
  'edit',
  'delete',
] as const;
