import { memo, useMemo } from 'react';
import { diffLines } from 'diff';
import { Button } from '@stagewise/stage-ui/components/button';
import type { PickToolPart } from './index.js';
import { CheckIcon, InfoIcon, XIcon } from 'lucide-react';

export const AskForDevScriptIntegrationToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForDevScriptIntegrationTool'>;
    onSubmit: (input: {
      shouldIntegrate: boolean;
      type: 'askForDevScriptIntegrationTool';
    }) => void;
    onCancel: () => void;
  }) => {
    const lines = diffLines(
      toolPart.input?.userInput.diff.before || '',
      toolPart.input?.userInput.diff.after || '',
    );
    const newLineCount = lines
      .filter((line) => line.added)
      .reduce((sum, line) => sum + (line.count || 0), 0);
    const deletedLineCount = lines
      .filter((line) => line.removed)
      .reduce((sum, line) => sum + (line.count || 0), 0);

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
        <div
          className={`rounded border border-black/10 bg-black/5 p-3 font-mono text-xs ${isError || isOutputAvailable ? 'opacity-50' : ''}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-black/60">Changes:</span>
            <span className="text-green-600">+{newLineCount}</span>
            <span className="text-rose-600">-{deletedLineCount}</span>
          </div>
          <div className="flex flex-col gap-1">
            {lines.map((line, index) => (
              <div
                key={`${index}-${line.value.slice(0, 20)}`}
                className={
                  line.added
                    ? 'bg-green-100 text-green-800'
                    : line.removed
                      ? 'bg-rose-100 text-rose-800'
                      : 'text-black/60'
                }
              >
                {line.value}
              </div>
            ))}
          </div>
        </div>
        {(isInputAvailable || isError || isOutputAvailable) && (
          <>
            <div className="flex w-full flex-row items-center justify-start gap-2 text-muted-foreground text-xs">
              <InfoIcon className="size-3 shrink-0 text-muted-foreground" />
              You can also start stagewise manually by running npx
              stagewise@beta anywhere in your terminal.
            </div>
            <div className="flex w-full flex-row items-center justify-end gap-2">
              {isInputAvailable && (
                <>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={onCancel}
                    disabled={isError || isOutputAvailable}
                  >
                    Don't integrate
                  </Button>
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => {
                      onSubmit({
                        shouldIntegrate: true,
                        type: 'askForDevScriptIntegrationTool',
                      });
                    }}
                    disabled={isError || isOutputAvailable}
                  >
                    Confirm Integration
                  </Button>
                </>
              )}
            </div>
          </>
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
