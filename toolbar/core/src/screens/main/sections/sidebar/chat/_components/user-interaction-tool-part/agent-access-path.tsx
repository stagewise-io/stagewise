import { memo, useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import type { PickToolPart } from './index.js';
import { CheckIcon, XIcon } from 'lucide-react';

export const AskForAgentAccessPathToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForAgentAccessPathTool'>;
    onSubmit: (input: {
      path: string;
      type: 'askForAgentAccessPathTool';
    }) => void;
    onCancel: () => void;
  }) => {
    const isError = useMemo(() => {
      return toolPart.state === 'output-error';
    }, [toolPart.state]);

    const isInputAvailable = useMemo(() => {
      return toolPart.state === 'input-available';
    }, [toolPart.state]);

    const isOutputAvailable = useMemo(() => {
      return toolPart.state === 'output-available';
    }, [toolPart.state]);

    return (
      <div className="flex w-full flex-col gap-2">
        <span className={isError || isOutputAvailable ? 'opacity-50' : ''}>
          Do you want to give stagewise access to this path?
        </span>
        <span className={isError || isOutputAvailable ? 'opacity-50' : ''}>
          {toolPart.input?.userInput.suggestedPath}
        </span>
        {(isInputAvailable || isError || isOutputAvailable) && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            {isInputAvailable && (
              <>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={onCancel}
                  disabled={isError || isOutputAvailable}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    onSubmit({
                      path: toolPart.input?.userInput.suggestedPath || '',
                      type: 'askForAgentAccessPathTool',
                    });
                  }}
                  disabled={isError || isOutputAvailable}
                >
                  Confirm Access
                </Button>
              </>
            )}
          </div>
        )}
        {isOutputAvailable && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <CheckIcon className="size-3 text-green-600" />
          </div>
        )}
        {isError && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <XIcon className="size-3 text-rose-600" />
          </div>
        )}
      </div>
    );
  },
);
