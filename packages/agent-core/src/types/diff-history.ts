import type { ChangeObject, StructuredPatchHunk } from 'diff';

export type AgentInstanceId = string;
export type Contributor = 'user' | `agent-${AgentInstanceId}`;

export type BlamedLineChange = ChangeObject<string> & {
  hunkId: string | null;
  contributor: Contributor;
};

/**
 * A unified-diff hunk enriched with an ID and contributor tracking.
 *
 * Because hunks are computed from a single baseline→current diff, a single hunk
 * can span changes made by different contributors. The `contributors` array
 * lists every distinct contributor whose added lines fall within this hunk,
 * derived from the per-line blame in `BlamedLineChange`.
 */
export type BlamedHunk = StructuredPatchHunk & {
  id: string;
  contributors: Contributor[];
};

type FileDiffBase = {
  isExternal: boolean;
  fileId: string;
  path: string;
};

export type TextFileDiff = FileDiffBase & {
  isExternal: false;
  baseline: string | null;
  current: string | null;
  baselineOid: string | null;
  currentOid: string | null;
  lineChanges: BlamedLineChange[];
  hunks: BlamedHunk[];
};

export type ExternalFileDiff = FileDiffBase & {
  isExternal: true;
  changeType: 'created' | 'deleted' | 'modified';
  baselineOid: string | null;
  currentOid: string | null;
  contributor: Contributor;
  hunkId: string;
};

export type FileDiff = TextFileDiff | ExternalFileDiff;

import { z } from 'zod';

export const fileDiffSnapshotSchema = z.object({
  path: z.string(),
  fileId: z.string(),
  isExternal: z.boolean(),
  baselineOid: z.string().nullable(),
  currentOid: z.string().nullable(),
  hunkIds: z.array(z.string()),
  contributors: z.array(z.string()),
});

export type FileDiffSnapshot = z.infer<typeof fileDiffSnapshotSchema>;

export const environmentDiffSnapshotSchema = z.object({
  pending: z.array(fileDiffSnapshotSchema),
  summary: z.array(fileDiffSnapshotSchema),
});

export type EnvironmentDiffSnapshot = z.infer<
  typeof environmentDiffSnapshotSchema
>;

export type TextFileResult = {
  isExternal: false;
  newBaseline?: string | null;
  newCurrent?: string | null;
};

export type ExternalFileResult = {
  isExternal: true;
  newBaselineOid?: string | null;
  newCurrentOid?: string | null;
};

export type FileResult = TextFileResult | ExternalFileResult;

export const MAX_DIFF_TEXT_FILE_SIZE = 2 * 1024 * 1024;
