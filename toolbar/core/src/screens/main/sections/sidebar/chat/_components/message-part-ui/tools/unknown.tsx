import type { DynamicToolUIPart, ToolUIPart } from '@stagewise/karton-contract';
import { ToolPartUIBase } from './_shared';

export const UnknownToolPart = ({
  part,
}: {
  part: ToolUIPart | DynamicToolUIPart;
}) => {
  return (
    <ToolPartUIBase
      part={part}
      toolName="Unknown tool"
      toolDescription={`Name of tool call: ${part.type}`}
    />
  );
};
