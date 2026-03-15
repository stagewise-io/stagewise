import { randomBytes } from 'node:crypto';

const TAB_ID_PREFIX = 't_';
const TAB_ID_CHAR_LENGTH = 6;

/**
 * Generates a short, stable tab ID in the format `t_<6 base36 chars>`.
 *
 * Example: `t_k7m2xp`
 *
 * @param existingIds Set of currently used IDs to avoid collisions.
 * @returns A unique tab ID string.
 */
export function generateTabId(existingIds?: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = randomBytes(4);
    const num = bytes.readUInt32BE(0);
    const base36 = num.toString(36).padStart(TAB_ID_CHAR_LENGTH, '0');
    const id = `${TAB_ID_PREFIX}${base36.slice(0, TAB_ID_CHAR_LENGTH)}`;

    if (!existingIds || !existingIds.has(id)) return id;
  }

  // Extremely unlikely fallback — 10 collisions in a row with ~2.2B space
  throw new Error('Failed to generate unique tab ID after 10 attempts');
}
