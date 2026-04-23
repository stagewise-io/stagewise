import {
  sqliteTable,
  integer,
  text,
  index,
  blob,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { metaTable } from '@/utils/migrate-database/types';

export const meta = metaTable;
export type AgentInstanceId = string;
export type ToolCallId = string;

export const snapshots = sqliteTable(
  'snapshots',
  {
    oid: text('oid').primaryKey(),
    payload: blob('payload').notNull(),
    delta_target_oid: text('delta_target_oid'), // points FORWARD to newer snapshot (null = this is latest)
    is_external: integer('is_external', { mode: 'boolean' })
      .notNull()
      .default(false), // true = content stored in blobsDir/{oid}, payload is empty
  },
  (table) => [
    primaryKey({ columns: [table.oid] }),
    index('snapshots_delta_target_oid_index').on(table.delta_target_oid),
  ],
);

export const operations = sqliteTable(
  'operations',
  {
    idx: integer('idx').primaryKey({ autoIncrement: true }),
    filepath: text('filepath').notNull(),
    operation: text('operation').notNull().$type<'baseline' | 'edit'>(),
    snapshot_oid: text('snapshot_oid').references(() => snapshots.oid, {
      onDelete: 'cascade',
    }), // null = file doesn't exist (deleted or didn't exist for baseline)
    reason: text('reason')
      .notNull()
      .$type<
        'init' | `tool-${ToolCallId}` | 'accept' | 'reject' | 'user-save'
      >(),
    contributor: text('contributor')
      .notNull()
      .$type<'user' | `agent-${AgentInstanceId}`>(),
  },
  (table) => [
    index('operations_filepath_index').on(table.filepath),
    index('operations_snapshot_oid_index').on(table.snapshot_oid),
    index('operations_reason_index').on(table.reason),
    index('operations_contributor_index').on(table.contributor),
    index('operations_filepath_op_idx').on(
      table.filepath,
      table.operation,
      table.idx,
      table.snapshot_oid,
    ),
  ],
);

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;

// Internal inferred types (not exported)
type InferredOperation = typeof operations.$inferSelect;
type InferredNewOperation = typeof operations.$inferInsert;

// Shared fields for Operation (excludes discriminated fields)
type OperationBase = Omit<
  InferredOperation,
  'operation' | 'contributor' | 'reason'
>;

// Shared fields for NewOperation (excludes discriminated fields)
type NewOperationBase = Omit<
  InferredNewOperation,
  'operation' | 'contributor' | 'reason'
>;

// Baseline operations: always 'user' contributor, reason is 'init' or 'accept'
type BaselineOperation = OperationBase & {
  operation: 'baseline';
  contributor: 'user';
  reason: 'init' | 'accept';
};

type NewBaselineOperation = NewOperationBase & {
  operation: 'baseline';
  contributor: 'user';
  reason: 'init' | 'accept';
};

// Edit operations: contributor can be 'user' or 'agent-{id}', reason is 'reject' or 'tool-{id}'
type EditOperation = OperationBase & {
  operation: 'edit';
  contributor: 'user' | `agent-${AgentInstanceId}`;
  reason: 'reject' | `tool-${ToolCallId}` | 'user-save';
};

type NewEditOperation = NewOperationBase & {
  operation: 'edit';
  contributor: 'user' | `agent-${AgentInstanceId}`;
  reason: 'reject' | `tool-${ToolCallId}` | 'user-save';
};

// Discriminated union exports (same export signature as before)
export type Operation = BaselineOperation | EditOperation;
export type NewOperation = NewBaselineOperation | NewEditOperation;

// Meta-only types for function parameters (excludes row-identifying fields)
type BaselineMeta = {
  operation: 'baseline';
  contributor: 'user';
  reason: 'init' | 'accept';
};

type EditMeta = {
  operation: 'edit';
  contributor: 'user' | `agent-${AgentInstanceId}`;
  reason: 'reject' | `tool-${ToolCallId}` | 'user-save';
};

export type OperationMeta = BaselineMeta | EditMeta;

export type Contributor = EditMeta['contributor'];
