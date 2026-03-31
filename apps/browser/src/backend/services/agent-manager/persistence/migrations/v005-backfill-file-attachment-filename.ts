import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';
import superjson from 'superjson';

/**
 * v5 — backfill-file-attachment-filename
 *
 * Before 2.1, `FileAttachment` records were stored under `metadata.fileAttachments`
 * with the blob key in the `id` field and no `fileName` / `path` fields.
 *
 * After 2.1, attachments live under `metadata.attachments` using the new
 * `Attachment` schema: `{ path: string, originalFileName?: string }`.
 *
 * This migration walks every persisted `AgentMessage` and:
 * 1. Reads any entries in `metadata.fileAttachments`.
 * 2. Converts each `{ id, fileName, originalFileName, ... }` record into the
 *    new `{ path, originalFileName }` shape, writing into `metadata.attachments`.
 * 3. Removes the legacy `metadata.fileAttachments` key.
 *
 * If a record already has a `path` field (new shape), it is kept as-is.
 */

interface LegacyFileAttachment {
  id?: string;
  fileName?: string;
  originalFileName?: string;
  mediaType?: string;
  sizeBytes?: number;
  path?: string;
  [key: string]: unknown;
}

interface NewAttachment {
  path: string;
  originalFileName?: string;
}

function migrateMessages(messages: unknown[]): boolean {
  let changed = false;

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;

    const metadata = m.metadata as Record<string, unknown> | undefined;
    if (!metadata) continue;

    // Handle legacy `fileAttachments` → new `attachments`
    const legacyAttachments = metadata.fileAttachments;
    if (Array.isArray(legacyAttachments) && legacyAttachments.length > 0) {
      const existing = Array.isArray(metadata.attachments)
        ? (metadata.attachments as NewAttachment[])
        : [];

      for (const att of legacyAttachments) {
        if (!att || typeof att !== 'object') continue;
        const a = att as LegacyFileAttachment;

        // Already migrated — has `path`
        if (a.path) {
          existing.push({
            path: a.path,
            originalFileName: a.originalFileName,
          });
          continue;
        }

        // Derive the blob key: prefer `fileName`, fall back to `id`.
        const blobKey = a.fileName || a.id;
        if (!blobKey) continue;

        // The canonical path for blob attachments is `att/<blobKey>`.
        const path = blobKey.startsWith('att/') ? blobKey : `att/${blobKey}`;

        existing.push({
          path,
          originalFileName: a.originalFileName,
        });
        changed = true;
      }

      metadata.attachments = existing;
      // Remove legacy key
      delete metadata.fileAttachments;
      changed = true;
    }
  }

  return changed;
}

export const up: MigrationScript['up'] = async (db) => {
  const rows = await db.all<{
    id: string;
    history: string;
    queued_messages: string;
  }>(sql`SELECT id, history, queued_messages FROM agentInstances`);

  for (const row of rows) {
    try {
      let historyChanged = false;
      let queuedChanged = false;

      const history = superjson.parse<unknown[]>(row.history);
      if (Array.isArray(history)) {
        historyChanged = migrateMessages(history);
      }

      let queued: unknown[] | null = null;
      if (row.queued_messages) {
        queued = superjson.parse<unknown[]>(row.queued_messages);
        if (Array.isArray(queued)) {
          queuedChanged = migrateMessages(queued);
        }
      }

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
      console.warn(
        `[migration:backfill-file-attachment-filename] Skipping row ${row.id}: ${err}`,
      );
    }
  }
};
