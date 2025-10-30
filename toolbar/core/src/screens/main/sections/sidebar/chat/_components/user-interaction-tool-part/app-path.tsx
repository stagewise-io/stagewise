import { memo, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import type { PickToolPart } from '.';
import { CheckIcon, XIcon } from 'lucide-react';

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

    const isDisabled =
      toolPart.state === 'output-error' ||
      toolPart.state === 'output-available';

    return (
      <div className="relative flex w-full flex-col gap-2">
        <h3 className={isDisabled ? 'opacity-50' : ''}>
          Which app do you want to use stagewise for?
        </h3>
        <RadioGroup
          className="bg-transparent"
          value={selectedPath}
          onValueChange={(value) => setSelectedPath(value as string)}
          disabled={isDisabled}
        >
          {toolPart.input?.userInput.suggestedPaths.map((path) => (
            <RadioLabel key={path.absolutePath}>
              <Radio value={path.absolutePath} disabled={isDisabled} />
              <span className={isDisabled ? 'opacity-50' : ''}>
                {path.displayName}
              </span>
            </RadioLabel>
          ))}
        </RadioGroup>
        {(toolPart.state === 'input-available' ||
          toolPart.state === 'output-error') && (
          <div className="ml-auto flex flex-row items-center gap-2">
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
        {toolPart.state === 'output-error' && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <XIcon className="size-3 text-rose-600" />
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
