import type { Tool } from 'ai';
import { z } from 'zod';

export type { Tool };

export type ToolWithMetadata<T extends Tool> = T & {
  stagewiseMetadata: StagewiseToolMetadata;
};

export const stagewiseToolMetadataSchema = z.object({
  requiresUserInteraction: z.boolean().default(false).optional(),
  runtime: z.enum(['client', 'server', 'browser']).default('client').optional(),
});

export type StagewiseToolMetadata = z.infer<typeof stagewiseToolMetadataSchema>;

type FileModifyDiffBase = {
  path: string;
  changeType: 'modify';
  beforeTruncated: boolean;
  afterTruncated: boolean;
  beforeContentSize: number;
  afterContentSize: number;
};

export type FileModifyDiff =
  | (FileModifyDiffBase & {
      before: string;
      after: string;
      beforeOmitted: false;
      afterOmitted: false;
    })
  | (FileModifyDiffBase & {
      before: string;
      beforeOmitted: false;
      afterOmitted: true;
    })
  | (FileModifyDiffBase & {
      after: string;
      beforeOmitted: true;
      afterOmitted: false;
    })
  | (FileModifyDiffBase & {
      beforeOmitted: true;
      afterOmitted: true;
    });

export type FileCreateDiff =
  | {
      path: string;
      changeType: 'create';
      after: string;
      truncated: boolean;
      omitted: false;
      contentSize: number;
    }
  | {
      path: string;
      changeType: 'create';
      truncated: boolean;
      omitted: true;
      contentSize: number;
    };

export type FileDeleteDiff =
  | {
      path: string;
      changeType: 'delete';
      before: string;
      truncated: boolean;
      omitted: false;
      contentSize: number;
    }
  | {
      path: string;
      changeType: 'delete';
      truncated: boolean;
      omitted: true;
      contentSize: number;
    };

export type FileDiff = FileModifyDiff | FileCreateDiff | FileDeleteDiff;

export type ToolResult = {
  undoExecute?: () => Promise<void>;
  success: boolean;
  error?: string;
  message?: string;
  result?: any;
  diff?: FileDiff;
};

export type Tools = Record<
  string,
  Tool<any, ToolResult> & {
    stagewiseMetadata?: StagewiseToolMetadata;
  }
>;
