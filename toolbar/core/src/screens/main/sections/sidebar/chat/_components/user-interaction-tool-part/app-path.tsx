import { memo, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import type { PickToolPart } from '.';
import { CheckIcon } from 'lucide-react';

export const AskForAppPathToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForAppPathTool'>;
    onSubmit: (input: { path: string; type: 'askForAppPathTool' }) => void;
    onCancel: () => void;
  }) => {
    const [selectedPath, setSelectedPath] = useState<string>(
      toolPart.input?.userInput.suggestedPaths[0]?.absolutePath || '',
    );

    if (!toolPart.input) {
      return (
        <div className="flex flex-col gap-2">
          <span>Error: No input available</span>
        </div>
      );
    }

    const isDisabled = toolPart.state === 'output-error';

    return (
      <div className="relative flex w-full flex-col gap-2">
        <span className={isDisabled ? 'opacity-50' : ''}>
          Choose the app you want to work on:
        </span>
        <RadioGroup
          value={selectedPath}
          onValueChange={(value) => setSelectedPath(value as string)}
          disabled={isDisabled}
        >
          {toolPart.input?.userInput.suggestedPaths.map((path) => (
            <RadioLabel key={path.absolutePath}>
              <Radio
                value={path.absolutePath}
                size="xs"
                disabled={isDisabled}
              />
              <span className={isDisabled ? 'opacity-50' : ''}>
                {path.displayName}
              </span>
            </RadioLabel>
          ))}
        </RadioGroup>
        {(toolPart.state === 'input-available' || isDisabled) && (
          <div className="flex flex-row items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={onCancel}
              disabled={isDisabled}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                onSubmit({
                  path: selectedPath,
                  type: 'askForAppPathTool',
                });
              }}
              disabled={isDisabled}
            >
              Choose App
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
