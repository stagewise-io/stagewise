import { cn } from '@/utils';
import type { ToolPart } from '@stagewise/karton-contract';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useKartonProcedure } from '@/hooks/use-karton';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { Input } from '@stagewise/stage-ui/components/input';

type InteractionToolPart = Extract<
  ToolPart,
  | { type: 'tool-askForPortTool' }
  | {
      type: 'tool-letUserPickAppPathTool';
    }
  | { type: 'tool-letUserConfirmRootProjectPathTool' }
>;

export function isInteractionToolPart(
  toolPart: ToolPart,
): toolPart is InteractionToolPart {
  return (
    toolPart.type === 'tool-askForPortTool' ||
    toolPart.type === 'tool-letUserPickAppPathTool' ||
    toolPart.type === 'tool-letUserConfirmRootProjectPathTool'
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
            <div className="flex flex-row items-center gap-2 rounded-md border-zinc-200 p-2">
              <Skeleton className="h-4 w-4" variant="circle" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-3/4" variant="text" />
              </div>
            </div>
          )}
          {(toolPart.state === 'input-available' ||
            toolPart.state === 'output-available') && (
            <>
              {toolPart.type === 'tool-letUserPickAppPathTool' && (
                <LetUserPickAppPathToolPartContent
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
              {toolPart.type === 'tool-letUserConfirmRootProjectPathTool' && (
                <LetUserConfirmRootProjectPathToolPartContent
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

type PickToolPart<T extends string> = Extract<
  InteractionToolPart,
  { type: T; state: 'input-available' } | { type: T; state: 'output-available' }
>;

const LetUserPickAppPathToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-letUserPickAppPathTool'>;
    onSubmit: (input: { path: string; type: 'askForAppPathTool' }) => void;
    onCancel: () => void;
  }) => {
    return (
      <div className="flex flex-col gap-2">
        <span>Choose the app you want to work on:</span>
        <div className="flex flex-col gap-2">
          {toolPart.input.userInput.suggestedPaths.map((path) => (
            <div key={path} className="flex flex-row items-center gap-2">
              <Checkbox /> <span>{path}</span>
            </div>
          ))}
        </div>
        {toolPart.state === 'input-available' && (
          <div className="flex flex-row items-center gap-2">
            <Button variant="secondary" size="xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                onSubmit({
                  path:
                    toolPart.input.userInput.suggestedPaths[0] ||
                    'TODO: make sure a path is there',
                  type: 'askForAppPathTool',
                });
              }}
            >
              Choose App
            </Button>
          </div>
        )}
        {toolPart.state === 'output-available' && <span>Saved!</span>}
      </div>
    );
  },
);

const LetUserConfirmRootProjectPathToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-letUserConfirmRootProjectPathTool'>;
    onSubmit: (input: {
      path: string;
      type: 'askForRootProjectPathTool';
    }) => void;
    onCancel: () => void;
  }) => {
    return (
      <div className="flex w-full flex-col gap-2">
        Do you want to give stagewise access to this project?
        <span>{toolPart.input.userInput.suggestedPath}</span>
        {toolPart.state === 'input-available' && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <Button variant="secondary" size="xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                onSubmit({
                  path: toolPart.input.userInput.suggestedPath,
                  type: 'askForRootProjectPathTool',
                });
              }}
            >
              Confirm Access
            </Button>
          </div>
        )}
        {toolPart.state === 'output-available' && <span>Saved!</span>}
      </div>
    );
  },
);

const AskForPortToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForPortTool'>;
    onSubmit: (input: { port: number; type: 'askForPortTool' }) => void;
    onCancel: () => void;
  }) => {
    return (
      <div className="flex flex-col gap-2">
        <span>
          Enter the port where the app is running on:
          <div className="flex flex-row items-center gap-2">
            <Input
              type="number"
              required
              value={toolPart.input.userInput.suggestedAppPort || 3000}
              onChange={(e) => {
                toolPart.input.userInput.suggestedAppPort = Number(
                  e.target.value,
                );
              }}
            />
            <Button variant="secondary" size="xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                onSubmit({
                  port: toolPart.input.userInput.suggestedAppPort || 3000,
                  type: 'askForPortTool',
                });
              }}
            >
              Submit
            </Button>
          </div>
        </span>
      </div>
    );
  },
);
