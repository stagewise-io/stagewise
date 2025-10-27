import { memo } from 'react';
import { diffLines } from 'diff';
import { Button } from '@stagewise/stage-ui/components/button';
import type { PickToolPart } from './index.js';
import { CheckIcon } from 'lucide-react';

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

    return (
      <div className="flex w-full flex-col gap-2">
        <div className="text-sm">
          Do you want to integrate stagewise into the dev script of your app?
        </div>
        <div className="rounded border border-black/10 bg-black/5 p-3 font-mono text-xs">
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
                  shouldIntegrate: true,
                  type: 'askForDevScriptIntegrationTool',
                });
              }}
            >
              Confirm Integration
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
