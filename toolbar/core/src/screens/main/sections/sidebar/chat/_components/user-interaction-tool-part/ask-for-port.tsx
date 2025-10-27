import { memo, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import type { PickToolPart } from '.';
import { CheckIcon } from 'lucide-react';

export const AskForPortToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForPortTool'>;
    onSubmit: (input: { port: number; type: 'askForPortTool' }) => void;
    onCancel: () => void;
  }) => {
    const [port, setPort] = useState<number>(
      toolPart.input?.userInput.suggestedAppPort || 3000,
    );

    return (
      <div className="flex w-full flex-col gap-2">
        <span>Enter the port where the app is running on:</span>
        {toolPart.state === 'input-available' && (
          <div className="flex w-full flex-row items-center gap-2">
            <Input
              type="number"
              required
              value={port}
              onChange={(e) => {
                setPort(Number(e.target.value));
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
                  port,
                  type: 'askForPortTool',
                });
              }}
            >
              Submit
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
