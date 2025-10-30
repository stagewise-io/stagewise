import type { ToolPart } from '@stagewise/karton-contract';
import { AskForAppPathToolPartContent } from './app-path';
import { AskForPortToolPartContent } from './ask-for-port';
import { AskForAgentAccessPathToolPartContent } from './agent-access-path';
import { cn } from '@/utils';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useKartonProcedure } from '@/hooks/use-karton';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { AskForDevScriptIntegrationToolPartContent } from './dev-script-integration';

export type InteractionToolPart = Extract<
  ToolPart,
  | { type: 'tool-askForPortTool' }
  | {
      type: 'tool-askForAppPathTool';
    }
  | { type: 'tool-askForAgentAccessPathTool' }
  | { type: 'tool-askForDevScriptIntegrationTool' }
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
    toolPart.type === 'tool-askForPortTool' ||
    toolPart.type === 'tool-askForAppPathTool' ||
    toolPart.type === 'tool-askForAgentAccessPathTool' ||
    toolPart.type === 'tool-askForDevScriptIntegrationTool'
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
      <div
        className={cn(
          '-mx-1 flex flex-col gap-2 rounded-xl bg-zinc-500/5 px-2 py-0.5',
        )}
      >
        <div className="flex w-full flex-row items-center justify-between gap-2 stroke-black/60">
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
              {toolPart.type === 'tool-askForPortTool' && (
                <AskForPortToolPartContent
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
              {toolPart.type === 'tool-askForDevScriptIntegrationTool' && (
                <AskForDevScriptIntegrationToolPartContent
                  toolPart={toolPart}
                  onSubmit={(input) =>
                    void submitUserInteractionToolInput(toolPart.toolCallId, {
                      shouldIntegrate: input.shouldIntegrate,
                      type: 'askForDevScriptIntegrationTool',
                    })
                  }
                  onCancel={() =>
                    void cancelUserInteractionToolInput(toolPart.toolCallId)
                  }
                />
              )}
            </>
          )}
          {toolPart.state === 'output-error' && (
            <XIcon className="size-3 text-rose-600" />
          )}
        </div>
      </div>
    );
  },
);
