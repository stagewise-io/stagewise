import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';
import superjson from 'superjson';

/**
 * v3 — unify-tab-ids
 *
 * Rewrites persisted AgentMessage blobs so that tab handle/id fields
 * use the unified schema (handle → id, activeTabHandle → activeTabId,
 * remove tabHandle from mentions/selectedElements).
 */
export const up: MigrationScript['up'] = async (db) => {
  // Fetch all rows with their raw SuperJSON text
  const rows = await db.all<{
    id: string;
    history: string;
    queued_messages: string;
  }>(sql`SELECT id, history, queued_messages FROM agentInstances`);

  for (const row of rows) {
    try {
      let historyChanged = false;
      let queuedChanged = false;

      // Transform history
      const history = superjson.parse<unknown[]>(row.history);
      if (Array.isArray(history)) {
        historyChanged = migrateMessages(history);
      }

      // Transform queued_messages (may be NULL for rows
      // created before the column was added)
      let queued: unknown[] | null = null;
      if (row.queued_messages) {
        queued = superjson.parse<unknown[]>(row.queued_messages);
        if (Array.isArray(queued)) {
          queuedChanged = migrateMessages(queued);
        }
      }

      // Only write back if something changed
      if (historyChanged || queuedChanged) {
        const newHistory = superjson.stringify(history);
        const newQueued = queuedChanged
          ? superjson.stringify(queued)
          : row.queued_messages;
        await db.run(
          sql`UPDATE agentInstances SET history = ${newHistory}, queued_messages = ${newQueued} WHERE id = ${row.id}`,
        );
      }
    } catch (err) {
      console.warn(`[migration:unify-tab-ids] Skipping row ${row.id}: ${err}`);
    }
  }
};

/**
 * Walks an AgentMessage[] blob and rewrites tab handle/id fields.
 * Returns true if any changes were made.
 */
function migrateMessages(messages: unknown[]): boolean {
  let changed = false;

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const metadata = (msg as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== 'object') continue;
    const meta = metadata as Record<string, unknown>;

    // 1. environmentSnapshot.browser.tabs[].handle → .id
    //    environmentSnapshot.browser.activeTabHandle → .activeTabId
    const envSnap = meta.environmentSnapshot;
    if (envSnap && typeof envSnap === 'object') {
      const env = envSnap as Record<string, unknown>;
      const browser = env.browser;
      if (browser && typeof browser === 'object') {
        const b = browser as Record<string, unknown>;

        // Rename activeTabHandle → activeTabId
        if ('activeTabHandle' in b) {
          b.activeTabId = b.activeTabHandle;
          delete b.activeTabHandle;
          changed = true;
        }

        // Rename tabs[].handle → tabs[].id
        const tabs = b.tabs;
        if (Array.isArray(tabs)) {
          for (const tab of tabs) {
            if (tab && typeof tab === 'object' && 'handle' in tab) {
              const t = tab as Record<string, unknown>;
              t.id = t.handle;
              delete t.handle;
              changed = true;
            }
          }
        }
      }
    }

    // 2. mentions[].tabHandle → remove (tabId already present)
    const mentions = meta.mentions;
    if (Array.isArray(mentions)) {
      for (const mention of mentions) {
        if (
          mention &&
          typeof mention === 'object' &&
          'tabHandle' in mention &&
          (mention as Record<string, unknown>).providerType === 'tab'
        ) {
          delete (mention as Record<string, unknown>).tabHandle;
          changed = true;
        }
      }
    }

    // 3. selectedPreviewElements[].tabHandle → remove (tabId already present)
    const elements = meta.selectedPreviewElements;
    if (Array.isArray(elements)) {
      for (const el of elements) {
        if (el && typeof el === 'object' && 'tabHandle' in el) {
          delete (el as Record<string, unknown>).tabHandle;
          changed = true;
        }
      }
    }
  }

  return changed;
}
