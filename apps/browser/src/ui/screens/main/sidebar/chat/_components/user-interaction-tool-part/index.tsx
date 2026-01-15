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

/**
 * Union type of all user-interaction tool parts.
 * Add new tool types here when creating new user-input tools.
 *
 * Note: When no user-input tools are active, this type is `never`.
 * Uncomment the Extract line when adding user-input tools.
 */
// When user-input tools are added, use:
// export type InteractionToolPart = Extract<
//   ToolPart,
//   { type: 'tool-exampleUserInputTool' } // | { type: 'tool-yourNewTool' }
// >;
export type InteractionToolPart = never;

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
 *
 * Note: Returns false when no user-input tools are active.
 */
export function isInteractionToolPart(
  _toolPart: ToolPart,
): _toolPart is InteractionToolPart {
  // When user-input tools are added, check their types:
  // return toolPart.type === 'tool-exampleUserInputTool';
  return false;
}

/**
 * Renders the appropriate UI component for a user-interaction tool.
 * Add new tool component cases here when creating new user-input tools.
 *
 * Note: This component is only used when user-input tools are active.
 * When InteractionToolPart is `never`, this component is never rendered.
 */
export const InteractionToolPartItem = memo(
  ({ toolPart }: { toolPart: InteractionToolPart }) => {
    const _submitUserInteractionToolInput = useKartonProcedure(
      (p) => p.agentChat.submitUserInteractionToolInput,
    );

    const _cancelUserInteractionToolInput = useKartonProcedure(
      (p) => p.agentChat.cancelUserInteractionToolInput,
    );

    // When no user-input tools are defined, toolPart is `never` and this code is unreachable.
    // TypeScript will error if we try to access properties on `never`.
    // This cast satisfies the type system while keeping the template code structure.
    const _unreachable: never = toolPart;
    void _unreachable;

    return (
      <div className="flex w-full flex-row items-center justify-between gap-2 stroke-black/60 pb-1">
        {/* Loading state while tool input is streaming */}
        {/*toolPart.state === 'input-streaming' && (
          <div className="flex w-full flex-row items-center gap-2 rounded-md border-zinc-200 p-2">
            <Skeleton className="h-4 w-4" variant="circle" />
            <div className="flex w-full flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>
          </div>
        )*/}

        {/* Render tool UI when input is ready or completed */}
        {/*(toolPart.state === 'input-available' ||
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
            }
          </>
        )*/}
      </div>
    );
  },
);
