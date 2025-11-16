import { memo, useMemo, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import type { PickToolPart } from '.';
import { CheckIcon, XIcon } from 'lucide-react';

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
        {(isInputAvailable || isError || isOutputAvailable) && (
          <div className="flex w-full flex-row items-center gap-2">
            <Input
              type="number"
              required
              value={port}
              onChange={(e) => {
                setPort(Number(e.target.value));
              }}
              disabled={isError || isOutputAvailable}
              className={isError || isOutputAvailable ? 'opacity-50' : ''}
            />
            {isInputAvailable && (
              <>
                <Button
                  className="shrink-0"
                  variant="secondary"
                  size="xs"
                  onClick={onCancel}
                  disabled={isError || isOutputAvailable}
                >
                  Cancel
                </Button>
                <Button
                  className="shrink-0"
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    onSubmit({
                      port,
                      type: 'askForPortTool',
                    });
                  }}
                  disabled={isError || isOutputAvailable}
                >
                  Submit
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
