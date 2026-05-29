/**
 * Core-owned environment-state schemas.
 *
 * After the env-state migration (Phase 4), agent-core no longer owns a
 * combined "full environment snapshot" type. Each domain adapter owns its
 * own state shape. The schemas here back the seven core-owned domains
 * (`workspace`, `agentsMd`, `workspaceMd`, `enabledSkills`, `plans`,
 * `logs`). Host-specific schemas (browser, shells, activeApp, logIngest)
 * live in the host package.
 *
 * `mountSchema` / `mountPermissionSchema` and the various `*EntrySchema`
 * exports are kept here because adjacent UI code (`agents-md` viewer,
 * plans renderer, …) still pulls them through the `@stagewise/agent-core`
 * public surface.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Section: workspace
// ---------------------------------------------------------------------------

export const mountPermissionSchema = z.enum([
  'read',
  'list',
  'create',
  'edit',
  'delete',
]);
export type MountPermission = z.infer<typeof mountPermissionSchema>;

export const mountSchema = z.object({
  prefix: z.string(),
  path: z.string(),
  permissions: z.array(mountPermissionSchema).optional(),
});
export type Mount = z.infer<typeof mountSchema>;

export const workspaceSnapshotSchema = z.object({
  mounts: z.array(mountSchema),
});
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;

// ---------------------------------------------------------------------------
// Section: agentsMd
// ---------------------------------------------------------------------------

export const agentsMdEntrySchema = z.object({
  mountPrefix: z.string(),
  content: z.string(),
});

export const agentsMdSnapshotSchema = z.object({
  entries: z.array(agentsMdEntrySchema),
  /** Mount prefixes where AGENTS.md is respected (user setting per workspace). */
  respectedMounts: z.array(z.string()),
});
export type AgentsMdSnapshot = z.infer<typeof agentsMdSnapshotSchema>;

// ---------------------------------------------------------------------------
// Section: workspaceMd
// ---------------------------------------------------------------------------

export const workspaceMdEntrySchema = z.object({
  mountPrefix: z.string(),
  content: z.string(),
});

export const workspaceMdSnapshotSchema = z.object({
  entries: z.array(workspaceMdEntrySchema),
});
export type WorkspaceMdSnapshot = z.infer<typeof workspaceMdSnapshotSchema>;

// ---------------------------------------------------------------------------
// Section: enabledSkills
// ---------------------------------------------------------------------------

export const enabledSkillsSnapshotSchema = z.object({
  paths: z.array(z.string()),
});
export type EnabledSkillsSnapshot = z.infer<typeof enabledSkillsSnapshotSchema>;

// ---------------------------------------------------------------------------
// Section: plans
// ---------------------------------------------------------------------------

export const planTaskSchema = z.object({
  text: z.string(),
  completed: z.boolean(),
  depth: z.number(),
});

export const taskGroupSchema = z.object({
  label: z.string(),
  tasks: z.array(planTaskSchema),
});

export const planEntrySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  filename: z.string(),
  totalTasks: z.number(),
  completedTasks: z.number(),
  taskGroups: z.array(taskGroupSchema),
});

export const plansSnapshotSchema = z.object({
  entries: z.array(planEntrySchema),
});
export type PlansSnapshot = z.infer<typeof plansSnapshotSchema>;

// ---------------------------------------------------------------------------
// Section: logs
// ---------------------------------------------------------------------------

export const logChannelSnapshotEntrySchema = z.object({
  filename: z.string(),
  byteSize: z.number(),
  lineCount: z.number(),
});

export const logsSnapshotSchema = z.object({
  entries: z.array(logChannelSnapshotEntrySchema),
});
export type LogsSnapshot = z.infer<typeof logsSnapshotSchema>;
