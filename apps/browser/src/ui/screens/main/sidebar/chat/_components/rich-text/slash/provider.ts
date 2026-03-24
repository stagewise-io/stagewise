import type { CommandDefinitionUI } from '@shared/commands';
import type { SlashItem } from './types';

/**
 * Module-level ref holding the current list of available commands.
 * Written synchronously by panel-footer during render (same pattern
 * as mentionContextRef) so the TipTap suggestion `items` callback
 * always sees current data.
 */
export const slashCommandsRef: { current: CommandDefinitionUI[] } = {
  current: [],
};

/**
 * Query available slash commands, filtering by the user's typed query string.
 */
export function querySlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return slashCommandsRef.current
    .filter(
      (cmd) =>
        !cmd.hidden &&
        (cmd.id.toLowerCase().includes(q) ||
          cmd.displayName.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q)),
    )
    .map(
      (cmd): SlashItem => ({
        id: cmd.id,
        label: cmd.displayName,
        description: cmd.description,
        group: cmd.source,
      }),
    );
}
