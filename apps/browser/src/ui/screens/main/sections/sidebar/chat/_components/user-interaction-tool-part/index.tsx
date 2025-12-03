import type { ToolPart } from '@shared/karton-contracts/ui';
import { AskForAppPathToolPartContent } from './app-path';
import { AskForAgentAccessPathToolPartContent } from './agent-access-path';
import { memo } from 'react';
import { useKartonProcedure } from '@/hooks/use-karton';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { AskForIdeToolPartContent } from './ask-for-ide';

export type InteractionToolPart = Extract<
  ToolPart,
  | {
      type: 'tool-askForAppPathTool';
    }
  | { type: 'tool-askForAgentAccessPathTool' }
  | { type: 'tool-askForIdeTool' }
>;

export type PickToolPart<T extends string> = Extract<
  InteractionToolPart,
  | { type: T; state: 'input-available' }
  | { type: T; state: 'output-available' }
  | { type: T; state: 'output-error' }
>;

export function isInteractionToolPart(
  toolPart: ToolPart,
): toolPart is InteractionToolPart {
  return (
    toolPart.type === 'tool-askForAppPathTool' ||
    toolPart.type === 'tool-askForAgentAccessPathTool' ||
    toolPart.type === 'tool-askForIdeTool'
  );
}

export const InteractionToolPartItem = memo(
  ({ toolPart }: { toolPart: InteractionToolPart }) => {
    const submitUserInteractionToolInput = useKartonProcedure(
      (p) => p.agentChat.submitUserInteractionToolInput,
    );

    const cancelUserInteractionToolInput = useKartonProcedure(
      (p) => p.agentChat.cancelUserInteractionToolInput,
    );

    return (
      <div className="flex w-full flex-row items-center justify-between gap-2 stroke-black/60 pb-1">
        {toolPart.state === 'input-streaming' && (
          <div className="flex w-full flex-row items-center gap-2 rounded-md border-zinc-200 p-2">
            <Skeleton className="h-4 w-4" variant="circle" />
            <div className="flex w-full flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>
          </div>
        )}
        {(toolPart.state === 'input-available' ||
          toolPart.state === 'output-available' ||
          toolPart.state === 'output-error') && (
          <>
            {toolPart.type === 'tool-askForAppPathTool' && (
              <AskForAppPathToolPartContent
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
            )}
            {toolPart.type === 'tool-askForAgentAccessPathTool' && (
              <AskForAgentAccessPathToolPartContent
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
            )}
            {toolPart.type === 'tool-askForIdeTool' && (
              <AskForIdeToolPartContent
                toolPart={toolPart}
                onCancel={() => {
                  void cancelUserInteractionToolInput(toolPart.toolCallId);
                }}
                onSubmit={(input) =>
                  void submitUserInteractionToolInput(
                    toolPart.toolCallId,
                    input,
                  )
                }
              />
            )}
          </>
        )}
      </div>
    );
  },
);
