/**
 * User Interaction Tool Part Registry
 *
 * This module handles rendering UI components for user-input tools.
 * User-input tools are special tools that require user interaction
 * through the UI before returning a result to the agent.
 *
 * To add a new user-input tool:
 * 1. Create the tool definition in agent/tools/src/user-input/
 * 2. Create a UI component in this directory (see example-tool.tsx)
 * 3. Add the tool type to InteractionToolPart union
 * 4. Add a case in isInteractionToolPart
 * 5. Add the component rendering in InteractionToolPartItem
 */

import type { ToolPart } from '@shared/karton-contracts/ui';
// import { ExampleUserInputToolPartContent } from './example-tool';
import { memo } from 'react';
import { useKartonProcedure } from '@/hooks/use-karton';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';

/**
 * Union type of all user-interaction tool parts.
 * Add new tool types here when creating new user-input tools.
 */
export type InteractionToolPart = Extract<
  ToolPart,
  { type: 'tool-exampleUserInputTool' }
>;

/**
 * Helper type to pick a specific tool part by type name.
 * Used by individual tool UI components to type their props.
 */
export type PickToolPart<T extends string> = Extract<
  InteractionToolPart,
  | { type: T; state: 'input-available' }
  | { type: T; state: 'output-available' }
  | { type: T; state: 'output-error' }
>;

/**
 * Type guard to check if a tool part is a user-interaction tool.
 * Add new tool type checks here when creating new user-input tools.
 */
export function isInteractionToolPart(
  toolPart: ToolPart,
): toolPart is InteractionToolPart {
  return toolPart.type === 'tool-exampleUserInputTool';
}

/**
 * Renders the appropriate UI component for a user-interaction tool.
 * Add new tool component cases here when creating new user-input tools.
 */
export const InteractionToolPartItem = memo(
  ({ toolPart }: { toolPart: InteractionToolPart }) => {
    const _submitUserInteractionToolInput = useKartonProcedure(
      (p) => p.agentChat.submitUserInteractionToolInput,
    );

    const _cancelUserInteractionToolInput = useKartonProcedure(
      (p) => p.agentChat.cancelUserInteractionToolInput,
    );

    return (
      <div className="flex w-full flex-row items-center justify-between gap-2 stroke-black/60 pb-1">
        {/* Loading state while tool input is streaming */}
        {toolPart.state === 'input-streaming' && (
          <div className="flex w-full flex-row items-center gap-2 rounded-md border-zinc-200 p-2">
            <Skeleton className="h-4 w-4" variant="circle" />
            <div className="flex w-full flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>
          </div>
        )}

        {/* Render tool UI when input is ready or completed */}
        {(toolPart.state === 'input-available' ||
          toolPart.state === 'output-available' ||
          toolPart.state === 'output-error') && (
          <>
            {/* {toolPart.type === 'tool-exampleUserInputTool' && (
              <ExampleUserInputToolPartContent
                toolPart={toolPart}
                onSubmit={(input) =>
                  void submitUserInteractionToolInput(
                    toolPart.toolCallId,
                    input,
                  )
                }
                onCancel={() =>
                  void cancelUserInteractionToolInput(toolPart.toolCallId)
                }
              />
            )} */}
            {/* Add new tool UI components here:
            {toolPart.type === 'tool-yourNewTool' && (
              <YourNewToolPartContent
                toolPart={toolPart}
                onSubmit={(input) =>
                  void submitUserInteractionToolInput(toolPart.toolCallId, input)
                }
                onCancel={() =>
                  void cancelUserInteractionToolInput(toolPart.toolCallId)
                }
              />
            )}
            */}
          </>
        )}
      </div>
    );
  },
);
