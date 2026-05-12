import { drizzle } from 'drizzle-orm/libsql/driver';
import * as schema from './schema';
import {
  and,
  notInArray,
  ilike,
  desc,
  isNull,
  eq,
  sql,
  gte,
} from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { migrateDatabase } from '@/utils/migrate-database';
import initSql from './schema.sql?raw';
import { registry, schemaVersion } from './migrations';
import type { Logger } from '@/services/logger';
import {
  AgentTypes,
  type AgentHistoryEntry,
  type AgentMessage,
} from '@shared/karton-contracts/ui/agent';
import type { ToolApprovalMode } from '@shared/karton-contracts/ui/shared-types';
import { getAgentDbPath } from '@/utils/paths';

export class AgentPersistenceDB {
  private _dbDriver: Client;
  private _db: LibSQLDatabase<typeof schema>;
  private _logger: Logger;
  private _lastPersistedIds = new Map<string, string[]>();

  private constructor(logger: Logger) {
    const dbPath = getAgentDbPath();
    logger.debug(
      `[AgentPersistenceDB] Creating agent persistence DB at path: ${dbPath}`,
    );
    this._dbDriver = createClient({ url: `file:${dbPath}` });
    this._db = drizzle(this._dbDriver, { schema });
    this._logger = logger;
  }

  public get db(): LibSQLDatabase<typeof schema> {
    return this._db;
  }

  public static async create(
    logger: Logger,
  ): Promise<AgentPersistenceDB | null> {
    const instance = new AgentPersistenceDB(logger);

    try {
      logger.debug(`[AgentPersistenceDB] Migrating database...`);
      await migrateDatabase({
        db: instance._db,
        client: instance._dbDriver,
        registry,
        initSql,
        schemaVersion,
      });
      logger.debug(`[AgentPersistenceDB] Database migrated successfully`);
    } catch (e) {
      const err: Error = e as Error;
      logger.error(
        `[AgentPersistenceDB] Failed to initialize. Error: ${err.message}, Stack: ${err.stack}`,
      );
      return null;
    }
    return instance;
  }

  // To prevent fetching already active agents as well, you can

  /**
   *
   * @param limit The number of agents to fetch
   * @param offset The offset to fetch the agents from
   * @param excludeIds The ids of the agents to exclude from the fetch
   * @param titleLike The title to filter the agents by (optional, case-insensitive)
   *
   * @note This method will not fetch any agents that have a parent agent instance.
   *
   * @returns The stored agent instances
   */
  public async getAgentHistoryEntries(
    limit: number,
    offset: number,
    excludeIds: string[],
    titleLike?: string,
  ): Promise<AgentHistoryEntry[]> {
    const results = await this._db
      .select({
        id: schema.agentInstances.id,
        title: schema.agentInstances.title,
        createdAt: schema.agentInstances.createdAt,
        lastMessageAt: schema.agentInstances.lastMessageAt,
        messageCount: sql<number>`(SELECT COUNT(*) FROM agentMessages WHERE agent_instance_id = ${schema.agentInstances.id})`,
        parentAgentInstanceId: schema.agentInstances.parentAgentInstanceId,
      })
      .from(schema.agentInstances)
      .orderBy(desc(schema.agentInstances.createdAt))
      .limit(limit)
      .offset(offset)
      .where(
        and(
          notInArray(schema.agentInstances.id, excludeIds),
          isNull(schema.agentInstances.parentAgentInstanceId),
          eq(schema.agentInstances.type, AgentTypes.CHAT),
          titleLike ? ilike(schema.agentInstances.title, titleLike) : undefined,
        ),
      );

    this._logger.debug(`[AgentPersistenceDB] Fetched agent history entries`);

    return results;
  }

  /**
   *
   * @param limit The number of agents to fetch
   * @param offset The offset to fetch the agents from
   * @param excludeIds The ids of the agents to exclude from the fetch
   * @param titleLike The title to filter the agents by (optional, case-insensitive)
   *
   * @note This method will not fetch any agents that have a parent agent instance.
   *
   * @returns The stored agent instances
   */
  public async getStoredAgentInstanceById(
    id: string,
  ): Promise<schema.StoredAgentInstance | null> {
    this._logger.debug(`[AgentPersistenceDB] Fetching agent instance: ${id}`);
    try {
      const results = await this._db
        .selectDistinct()
        .from(schema.agentInstances)
        .where(eq(schema.agentInstances.id, id))
        .limit(1);

      const row = results?.[0] ?? null;
      if (!row) return null;

      // Reconstruct history from normalised message rows
      const messageRows = await this._db
        .select()
        .from(schema.agentMessages)
        .where(eq(schema.agentMessages.agentInstanceId, id))
        .orderBy(schema.agentMessages.seq);

      const history: AgentMessage[] = messageRows.map((r) => ({
        id: r.messageId,
        role: r.role as AgentMessage['role'],
        parts: r.parts as AgentMessage['parts'],
        metadata: r.metadata as AgentMessage['metadata'],
      }));

      // Initialise dirty-tracking baseline
      this._lastPersistedIds.set(
        id,
        messageRows.map((r) => r.messageId),
      );

      return { ...row, history };
    } catch (error) {
      this._logger.error(
        `[AgentPersistenceDB] Failed to fetch agent instance: ${error}`,
      );
      return null;
    }
  }

  /**
   * Stores or updates an agent instance in the persistence layer.
   * History is persisted incrementally into the `agentMessages` table —
   * only changed / new messages are written.
   *
   * @param agentInstance Scalar agent metadata (without history)
   * @param history       Current in-memory message history
   */
  public async storeAgentInstance(
    agentInstance: Omit<schema.NewStoredAgentInstance, 'history'>,
    history: AgentMessage[],
    dirtyMessageIndices?: number[],
  ): Promise<void> {
    const id = agentInstance.id;
    this._logger.debug(`[AgentPersistenceDB] Storing agent instance: ${id}`);

    // Compute divergence point outside the transaction (pure, no I/O)
    const lastIds = this._lastPersistedIds.get(id) ?? [];
    const divergePoint = this._findDivergencePoint(history, lastIds);

    try {
      await this._db.transaction(async (tx) => {
        // 1. Upsert scalar metadata (legacy history column gets $defaultFn → [])
        await tx
          .insert(schema.agentInstances)
          .values(agentInstance as schema.NewStoredAgentInstance)
          .onConflictDoUpdate({
            target: schema.agentInstances.id,
            set: {
              ...agentInstance,
            },
          });

        // 2. Incremental message persistence via divergence detection

        // Delete divergent / truncated messages
        if (divergePoint < lastIds.length) {
          await tx
            .delete(schema.agentMessages)
            .where(
              and(
                eq(schema.agentMessages.agentInstanceId, id),
                gte(schema.agentMessages.seq, divergePoint),
              ),
            );
        }

        // Insert new / replacement messages from the divergence point
        if (divergePoint < history.length) {
          const newMsgs = history.slice(divergePoint);
          await tx.insert(schema.agentMessages).values(
            newMsgs.map((msg, i) => ({
              agentInstanceId: id,
              seq: divergePoint + i,
              messageId: msg.id,
              role: msg.role,
              parts: msg.parts as unknown[],
              metadata: (msg.metadata ?? null) as unknown,
            })),
          );
        } else if (history.length > 0) {
          // No structural change — update the last message in case of
          // in-place mutations (streaming content, attachment draining)
          const lastMsg = history[history.length - 1];
          await tx
            .update(schema.agentMessages)
            .set({
              messageId: lastMsg.id,
              role: lastMsg.role,
              parts: lastMsg.parts as unknown[],
              metadata: (lastMsg.metadata ?? null) as unknown,
            })
            .where(
              and(
                eq(schema.agentMessages.agentInstanceId, id),
                eq(schema.agentMessages.seq, history.length - 1),
              ),
            );
        }

        // 3. Targeted updates for in-place mutations on non-tail messages
        //    (e.g. history compression writing compressedHistory metadata)
        if (dirtyMessageIndices && dirtyMessageIndices.length > 0) {
          for (const idx of dirtyMessageIndices) {
            // Skip out-of-bounds or indices already written by divergence path
            if (idx < 0 || idx >= history.length || idx >= divergePoint)
              continue;
            const msg = history[idx];
            await tx
              .update(schema.agentMessages)
              .set({
                messageId: msg.id,
                role: msg.role,
                parts: msg.parts as unknown[],
                metadata: (msg.metadata ?? null) as unknown,
              })
              .where(
                and(
                  eq(schema.agentMessages.agentInstanceId, id),
                  eq(schema.agentMessages.seq, idx),
                ),
              );
          }
        }
      });

      // Update dirty-tracking state only after successful commit
      this._lastPersistedIds.set(
        id,
        history.map((m) => m.id),
      );
    } catch (error) {
      this._logger.error(
        `[AgentPersistenceDB] Failed to store agent instance: ${(error as Error).message}, ${(error as Error).stack}`,
      );
    }
  }

  /**
   * Finds the first index where the current history diverges from the
   * last-persisted message IDs.  Optimises for the common case (pure
   * append) with a single comparison at the tail of the shared range.
   */
  private _findDivergencePoint(
    history: AgentMessage[],
    lastIds: string[],
  ): number {
    const minLen = Math.min(history.length, lastIds.length);
    if (minLen === 0) return 0;
    // Fast path: if the last shared position matches, no undo occurred
    if (history[minLen - 1].id === lastIds[minLen - 1]) {
      return minLen;
    }
    // Slow path: linear scan for the divergence point
    for (let i = 0; i < minLen; i++) {
      if (history[i].id !== lastIds[i]) return i;
    }
    return minLen;
  }

  /**
   * Returns the activeModelId of the most recently persisted chat agent,
   * or null if no chat agents exist.
   */
  public async getLastChatModelId(): Promise<
    schema.StoredAgentInstance['activeModelId'] | null
  > {
    const results = await this._db
      .select({ activeModelId: schema.agentInstances.activeModelId })
      .from(schema.agentInstances)
      .where(
        and(
          isNull(schema.agentInstances.parentAgentInstanceId),
          eq(schema.agentInstances.type, AgentTypes.CHAT),
        ),
      )
      .orderBy(desc(schema.agentInstances.lastMessageAt))
      .limit(1)
      .catch((error) => {
        this._logger.error(
          `[AgentPersistenceDB] Failed to fetch last chat model id: ${error}`,
        );
        return null;
      });

    return results?.[0]?.activeModelId ?? null;
  }

  /**
   * Returns the toolApprovalMode of the most recently persisted chat agent,
   * or null if no chat agents exist.
   */
  public async getLastChatToolApprovalMode(): Promise<
    schema.StoredAgentInstance['toolApprovalMode'] | null
  > {
    const results = await this._db
      .select({ toolApprovalMode: schema.agentInstances.toolApprovalMode })
      .from(schema.agentInstances)
      .where(
        and(
          isNull(schema.agentInstances.parentAgentInstanceId),
          eq(schema.agentInstances.type, AgentTypes.CHAT),
        ),
      )
      .orderBy(desc(schema.agentInstances.lastMessageAt))
      .limit(1)
      .catch((error) => {
        this._logger.error(
          `[AgentPersistenceDB] Failed to fetch last chat tool approval mode: ${error}`,
        );
        return null;
      });

    return results?.[0]?.toolApprovalMode ?? null;
  }

  /**
   * Returns the mountedWorkspaces of the most recently persisted chat agent,
   * or null if no chat agents exist.
   */
  public async getLastChatWorkspacePaths(): Promise<
    schema.StoredAgentInstance['mountedWorkspaces'] | null
  > {
    const results = await this._db
      .select({
        mountedWorkspaces: schema.agentInstances.mountedWorkspaces,
      })
      .from(schema.agentInstances)
      .where(
        and(
          isNull(schema.agentInstances.parentAgentInstanceId),
          eq(schema.agentInstances.type, AgentTypes.CHAT),
        ),
      )
      .orderBy(desc(schema.agentInstances.lastMessageAt))
      .limit(1)
      .catch((error) => {
        this._logger.error(
          `[AgentPersistenceDB] Failed to fetch last chat workspace paths: ${error}`,
        );
        return null;
      });

    return results?.[0]?.mountedWorkspaces ?? null;
  }

  /**
   * Updates just the title (and titleLockedByUser flag) of a persisted agent
   * without rehydrating it into memory. Used for renaming inactive history
   * agents — active ones go through BaseAgent.setTitle so Karton state and
   * DB stay in sync via the normal saveState() path.
   *
   * @returns true if a row was updated, false if no agent with that id exists.
   */
  public async updateAgentTitle(id: string, title: string): Promise<boolean> {
    this._logger.debug(`[AgentPersistenceDB] Updating title for agent: ${id}`);
    try {
      const result = await this._db
        .update(schema.agentInstances)
        .set({ title, titleLockedByUser: true })
        .where(eq(schema.agentInstances.id, id));
      return (result as unknown as { rowsAffected: number }).rowsAffected > 0;
    } catch (error) {
      this._logger.error(
        `[AgentPersistenceDB] Failed to update agent title: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Updates just the tool approval mode of a persisted agent without
   * going through the full `storeAgentInstance` path. Avoids touching
   * history/message persistence, so it is safe to call on empty agents.
   *
   * @returns true if a row was updated, false if no agent with that id exists.
   */
  public async updateToolApprovalMode(
    id: string,
    mode: ToolApprovalMode,
  ): Promise<boolean> {
    this._logger.debug(
      `[AgentPersistenceDB] Updating tool approval mode for agent: ${id}`,
    );
    try {
      const result = await this._db
        .update(schema.agentInstances)
        .set({ toolApprovalMode: mode })
        .where(eq(schema.agentInstances.id, id));
      return (result as unknown as { rowsAffected: number }).rowsAffected > 0;
    } catch (error) {
      this._logger.error(
        `[AgentPersistenceDB] Failed to update tool approval mode: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Deletes an agent instance from the persistence layer.
   *
   * @param id The id of the agent instance to delete
   */
  public async deleteAgentInstance(id: string): Promise<void> {
    this._logger.debug(`[AgentPersistenceDB] Deleting agent instance: ${id}`);
    // Recursively delete all persisted child agents
    const childAgentInstanceIds = await this._db
      .select({ id: schema.agentInstances.id })
      .from(schema.agentInstances)
      .where(eq(schema.agentInstances.parentAgentInstanceId, id));
    for (const childAgentInstanceId of childAgentInstanceIds) {
      await this.deleteAgentInstance(childAgentInstanceId.id);
    }

    // Delete associated messages first
    await this._db
      .delete(schema.agentMessages)
      .where(eq(schema.agentMessages.agentInstanceId, id))
      .catch((error) => {
        this._logger.error(
          `[AgentPersistenceDB] Failed to delete agent messages: ${error}`,
        );
      });

    await this._db
      .delete(schema.agentInstances)
      .where(eq(schema.agentInstances.id, id))
      .catch((error) => {
        this._logger.error(
          `[AgentPersistenceDB] Failed to delete agent instance: ${error}`,
        );
      });

    // Clean up dirty-tracking state
    this._lastPersistedIds.delete(id);
  }
}
