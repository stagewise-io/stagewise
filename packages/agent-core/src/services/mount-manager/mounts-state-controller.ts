import type { MountEntry } from '../../types/metadata';

/**
 * Structural contract for the store seam that owns the per-agent
 * `toolbox[agentId].workspace.mounts` slice.
 *
 * Phase 3b established that `MountManager` is the sole writer and
 * dispatches through this controller instead of touching Karton
 * directly. This file mirrors the host's concrete implementation
 * (`apps/browser/.../toolbox-mounts.ts`) so the core `MountManager`
 * can accept the host controller structurally without importing it.
 *
 * Contract:
 *   - Writes are whole-array replacement. Callers must always allocate
 *     a fresh array (and fresh `MountEntry` objects for per-field
 *     updates) so downstream reference-identity diffs fire.
 *   - The controller is the sole writer for the migrated slice.
 */
export interface MountsStateController {
  setMounts(agentInstanceId: string, mounts: MountEntry[]): void;
  getMounts(agentInstanceId: string): MountEntry[];
}
