import type { CommandDefinitionUI } from '@shared/commands';
import type { SlashItem } from './types';

const MAX_COLLAPSED = 3;

/**
 * Module-level ref holding the current list of available commands.
 * Written synchronously by panel-footer during render (same pattern
 * as mentionContextRef) so the TipTap suggestion `items` callback
 * always sees current data.
 */
export const slashCommandsRef: { current: CommandDefinitionUI[] } = {
  current: [],
};

/** Groups that the user has expanded in the current `/` session. */
const expandedGroups = new Set<string>();

/** Toggle a group's expansion state. */
export function toggleSlashGroup(group: string): void {
  if (expandedGroups.has(group)) expandedGroups.delete(group);
  else expandedGroups.add(group);
}

/** Reset all groups to collapsed. Called at the start of each `/` session. */
export function resetSlashExpansion(): void {
  expandedGroups.clear();
}

/** Fixed render order for groups. */
const GROUP_ORDER: readonly string[] = ['builtin', 'workspace', 'plugin'];

/**
 * Query available slash commands, filtering by the user's typed query string.
 * Non-builtin groups with more than MAX_COLLAPSED items are truncated
 * unless the user has expanded them.
 */
export function querySlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  const all = slashCommandsRef.current
    .filter(
      (cmd) =>
        cmd.id.toLowerCase().includes(q) ||
        cmd.displayName.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    )
    .map(
      (cmd): SlashItem => ({
        id: cmd.id,
        label: cmd.displayName,
        description: cmd.description,
        group: cmd.source,
      }),
    );

  // Bucket by group, preserving discovery order within each bucket.
  const buckets = new Map<string, SlashItem[]>();
  for (const item of all) {
    const group = item.group || 'builtin';
    let bucket = buckets.get(group);
    if (!bucket) {
      bucket = [];
      buckets.set(group, bucket);
    }
    bucket.push(item);
  }

  // Reassemble with truncation for non-builtin groups.
  const result: SlashItem[] = [];

  for (const group of GROUP_ORDER) {
    const bucket = buckets.get(group);
    if (!bucket || bucket.length === 0) continue;
    appendGroup(result, group, bucket);
  }

  // Include any groups not in GROUP_ORDER (future-proof).
  for (const [group, bucket] of Array.from(buckets)) {
    if (GROUP_ORDER.includes(group)) continue;
    appendGroup(result, group, bucket);
  }

  return result;
}

function appendGroup(
  result: SlashItem[],
  group: string,
  bucket: SlashItem[],
): void {
  if (
    group === 'builtin' ||
    bucket.length <= MAX_COLLAPSED ||
    expandedGroups.has(group)
  ) {
    result.push(...bucket);
    return;
  }

  // Truncate: first MAX_COLLAPSED items + synthetic "Show N more" item.
  const visible = bucket.slice(0, MAX_COLLAPSED);
  const hidden = bucket.slice(MAX_COLLAPSED);
  result.push(...visible);
  result.push({
    id: `__expand:${group}__`,
    label: `Show ${hidden.length} more`,
    group,
    expandGroup: group,
    hiddenItems: hidden,
  });
}
