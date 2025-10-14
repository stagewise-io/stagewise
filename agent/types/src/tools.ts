import type { Tool } from 'ai';
import { z } from 'zod';

export type { Tool };

export type SharedToolOutput =
  | {
      success: true;
      message: string;
      result?: any;
      hiddenMetadata?: { diff?: FileDiff; undoExecute?: () => Promise<void> };
    }
  | {
      success: false;
      message: string;
      error: string;
    };

export const stagewiseToolMetadataSchema = z.object({
  requiresUserInteraction: z.boolean().default(false).optional(),
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
  hidden?: {
    diff?: FileDiff;
    undoExecute?: () => Promise<void>;
  };
};

export type Tools = Record<
  string,
  Tool<any, ToolResult> & {
    stagewiseMetadata?: StagewiseToolMetadata;
  }
>;

/**
 * Type guard to check if a SharedToolOutput has undoExecute in hiddenMetadata
 */
export function hasUndoMetadata(output: any): output is {
  hiddenMetadata: { undoExecute: () => Promise<void> };
} {
  return (
    output &&
    typeof output === 'object' &&
    'hiddenMetadata' in output &&
    output.hiddenMetadata &&
    typeof output.hiddenMetadata === 'object' &&
    'undoExecute' in output.hiddenMetadata &&
    typeof output.hiddenMetadata.undoExecute === 'function'
  );
}

/**
 * Type guard to check if a SharedToolOutput has diff in hiddenMetadata
 */
export function hasDiffMetadata(
  output: any,
): output is { hiddenMetadata: { diff: FileDiff } } {
  return (
    output &&
    typeof output === 'object' &&
    'hiddenMetadata' in output &&
    output.hiddenMetadata &&
    typeof output.hiddenMetadata === 'object' &&
    'diff' in output.hiddenMetadata &&
    output.hiddenMetadata.diff !== null &&
    output.hiddenMetadata.diff !== undefined
  );
}
