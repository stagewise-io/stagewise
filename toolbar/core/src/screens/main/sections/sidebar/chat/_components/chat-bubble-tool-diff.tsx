import { diffLines } from 'diff';
import type { ToolPart, DynamicToolUIPart } from '@stagewise/karton-contract';

// Extract tool parts that have a diff property in their output from the discriminated union
export type ToolPartWithDiff = Extract<
  ToolPart,
  {
    type:
      | 'tool-deleteFileTool'
      | 'tool-multiEditTool'
      | 'tool-overwriteFileTool';
    output: any;
  }
>;

export const isFileEditTool = (
  toolPart: ToolPart | DynamicToolUIPart,
): toolPart is ToolPartWithDiff => {
  if (
    toolPart.type === 'tool-deleteFileTool' ||
    toolPart.type === 'tool-multiEditTool' ||
    toolPart.type === 'tool-overwriteFileTool'
  )
    return true;
  else return false;
};

const getFallbackToolDescription = (toolPart: ToolPart | DynamicToolUIPart) => {
  return <span className="text-black/80 text-xs">{getToolName(toolPart)}</span>;
};

export const getToolName = (toolPart: ToolPart | DynamicToolUIPart): string => {
  switch (toolPart.type) {
    case 'tool-readFileTool':
      return 'Reading Files';
    case 'tool-listFilesTool':
      return 'Listing Files';
    case 'tool-grepSearchTool':
      return 'Searching with Grep';
    case 'tool-globTool':
      return 'Searching with Glob';
    case 'tool-overwriteFileTool': {
      const fileName = getFileName(toolPart.output?.diff?.path ?? '');
      return `Overwriting ${fileName}`;
    }
    case 'tool-multiEditTool': {
      const fileName = getFileName(toolPart.output?.diff?.path ?? '');
      return `Editing ${fileName}`;
    }
    case 'tool-deleteFileTool': {
      const fileName = getFileName(toolPart.output?.diff?.path ?? '');
      return `Deleting ${fileName}`;
    }
    case 'dynamic-tool':
      return toolPart.toolName;
    default:
      return 'Unknown Tool';
  }
};

const getFileName = (path: string) => {
  return path.split('/').pop();
};

export const getToolDescription = (toolPart: ToolPart | DynamicToolUIPart) => {
  if (
    !isFileEditTool(toolPart) ||
    toolPart.state !== 'output-available' ||
    toolPart.output.diff === undefined
  )
    return getFallbackToolDescription(toolPart);

  switch (toolPart.output.diff.changeType) {
    case 'create': {
      if (toolPart.output.diff.omitted === true) {
        return (
          <span className="text-black/80 text-xs">
            {getFileName(toolPart.output.diff.path)}
            <span className="text-green-600 text-xs"> (new)</span>
          </span>
        );
      }
      const lines = diffLines('', toolPart.output.diff.after);
      const newLineCount = lines
        .filter((line) => line.added)
        .reduce((sum, line) => sum + (line.count || 0), 0);
      const fileName = getFileName(toolPart.output.diff.path);
      return (
        <span className="text-black/80 text-xs">
          {fileName}
          <span className="text-green-600 text-xs"> (new) +{newLineCount}</span>
        </span>
      );
    }
    case 'delete': {
      const fileName = getFileName(toolPart.output.diff.path);
      if (toolPart.output.diff.omitted === true)
        return (
          <span className="text-black/80 text-xs">
            {fileName}
            <span className="text-rose-600 text-xs"> (deleted)</span>
          </span>
        );
      const lines = diffLines(toolPart.output.diff.before, '');
      const deletedLineCount = lines
        .filter((line) => line.removed)
        .reduce((sum, line) => sum + (line.count || 0), 0);
      return (
        <span className="text-black/80 text-xs">
          {fileName}
          <span className="text-rose-600 text-xs">
            {' '}
            (deleted) -{deletedLineCount}
          </span>
        </span>
      );
    }
    case 'modify': {
      if (
        toolPart.output.diff.afterOmitted === true ||
        toolPart.output.diff.beforeOmitted === true
      )
        return getFallbackToolDescription(toolPart);
      const lines = diffLines(
        toolPart.output.diff.before,
        toolPart.output.diff.after,
      );
      const newLineCount = lines
        .filter((line) => line.added)
        .reduce((sum, line) => sum + (line.count || 0), 0);
      const deletedLineCount = lines
        .filter((line) => line.removed)
        .reduce((sum, line) => sum + (line.count || 0), 0);
      const fileName = getFileName(toolPart.output.diff.path);
      return (
        <span className="text-black/80 text-xs">
          {fileName}{' '}
          <span className="text-green-600 text-xs">+{newLineCount}</span>{' '}
          <span className="text-rose-600 text-xs">-{deletedLineCount}</span>
        </span>
      );
    }
  }
};
