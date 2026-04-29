import {
  sqliteTable,
  integer,
  text,
  index,
  primaryKey,
  customType,
} from 'drizzle-orm/sqlite-core';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { metaTable } from '@/utils/migrate-database/types';
import type { ModelId } from '@shared/available-models';
import { relations } from 'drizzle-orm';
import type { AgentTypes } from '@shared/karton-contracts/ui/agent';
import type { MountPermission } from '@shared/karton-contracts/ui/agent/metadata';
import {
  toolApprovalModeSchema,
  type ToolApprovalMode,
} from '@shared/karton-contracts/ui/shared-types';
import superjson from 'superjson';

const _sqliteBoolean = customType<{ data: boolean; driverData: number }>({
  dataType() {
    // what SQLite will store
    return 'integer';
  },
  toDriver(value) {
    // TS boolean -> DB integer
    return value ? 1 : 0;
  },
  fromDriver(value) {
    // DB integer -> TS boolean
    return value === 1;
  },
});

const agentType = customType<{ data: AgentTypes; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value as AgentTypes;
  },
});

const modelId = customType<{ data: ModelId; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value as ModelId;
  },
});

const toolApprovalMode = customType<{
  data: ToolApprovalMode;
  driverData: string;
}>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    // Fail-closed: any value that doesn't match the schema falls back to
    // 'alwaysAsk' so a corrupted or unexpected DB entry cannot bypass tool
    // approvals downstream.
    const parsed = toolApprovalModeSchema.safeParse(value);
    return parsed.success ? parsed.data : 'alwaysAsk';
  },
});

const _sqliteJson = customType<{ data: unknown; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return superjson.stringify(value);
  },
  fromDriver(value) {
    return superjson.parse(value);
  },
});

export const meta = metaTable;

export const agentInstances = sqliteTable(
  'agentInstances',
  {
    id: text('id').primaryKey(),
    parentAgentInstanceId: text('parent_agent_instance_id'),
    type: agentType('type').notNull(),
    instanceConfig: _sqliteJson('instance_config').$type<unknown>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp' }).notNull(),
    activeModelId: modelId('active_model_id').notNull(),
    title: text('title').notNull(),
    titleLockedByUser: _sqliteBoolean('title_locked_by_user'),
    /** @deprecated Kept for rollback safety. Read/write via agentMessages table instead. */
    history: _sqliteJson('history')
      .notNull()
      .$type<AgentMessage[]>()
      .$defaultFn(() => [] as AgentMessage[]),
    queuedMessages: _sqliteJson('queued_messages')
      .notNull()
      .$type<(AgentMessage & { role: 'user' })[]>(),
    inputState: _sqliteJson('input_state').notNull().$type<string>(),
    usedTokens: integer('used_tokens').notNull(),
    mountedWorkspaces:
      _sqliteJson('mounted_workspaces').$type<
        Array<{ path: string; permissions: MountPermission[] }>
      >(),
    toolApprovalMode: toolApprovalMode('tool_approval_mode')
      .notNull()
      .$defaultFn(() => 'alwaysAsk'),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('agents_created_at_index').on(table.createdAt),
    index('agents_last_message_at_index').on(table.lastMessageAt),
  ],
);

export const agentMessages = sqliteTable(
  'agentMessages',
  {
    agentInstanceId: text('agent_instance_id').notNull(),
    seq: integer('seq').notNull(),
    messageId: text('message_id').notNull(),
    role: text('role').notNull(),
    parts: _sqliteJson('parts').notNull().$type<unknown[]>(),
    metadata: _sqliteJson('metadata').$type<unknown>(),
  },
  (table) => [
    primaryKey({ columns: [table.agentInstanceId, table.seq] }),
    index('agent_messages_agent_id_index').on(table.agentInstanceId),
  ],
);

const _agentMessageRelations = relations(agentMessages, ({ one }) => ({
  agentInstance: one(agentInstances, {
    fields: [agentMessages.agentInstanceId],
    references: [agentInstances.id],
  }),
}));

const _agentInstanceRelations = relations(agentInstances, ({ one, many }) => ({
  parentAgentInstance: one(agentInstances, {
    fields: [agentInstances.parentAgentInstanceId],
    references: [agentInstances.id],
  }),
  childAgentInstances: many(agentInstances, {
    relationName: 'childAgentInstances',
  }),
  messages: many(agentMessages),
}));

export type NewStoredAgentInstance = typeof agentInstances.$inferInsert;
export type StoredAgentInstance = typeof agentInstances.$inferSelect;
