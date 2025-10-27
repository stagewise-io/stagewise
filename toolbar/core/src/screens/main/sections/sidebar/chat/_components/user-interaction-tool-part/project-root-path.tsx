import { memo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import type { PickToolPart } from '.';
import { CheckIcon } from 'lucide-react';

export const AskForRootProjectPathToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForRootProjectPathTool'>;
    onSubmit: (input: {
      path: string;
      type: 'askForRootProjectPathTool';
    }) => void;
    onCancel: () => void;
  }) => {
    return (
      <div className="flex w-full flex-col gap-2">
        Do you want to give stagewise access to this project?
        <span>{toolPart.input?.userInput.suggestedPath}</span>
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
        {toolPart.state === 'output-available' && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <CheckIcon className="size-3 text-green-600" />
          </div>
        )}
      </div>
    );
  },
);
