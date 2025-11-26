import { memo, useMemo, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import type { PickToolPart } from './index.js';
import { CheckIcon, XIcon, ChevronDownIcon } from 'lucide-react';
import { IdeLogo } from '@/components/ide-logo';

const IDE_OPTIONS: Array<{
  value: OpenFilesInIde;
  label: string;
  logo?: React.ReactNode;
}> = [
  {
    value: 'cursor',
    label: 'Cursor',
    logo: <IdeLogo ide="cursor" className="size-4" />,
  },
  {
    value: 'vscode',
    label: 'VS Code',
    logo: <IdeLogo ide="vscode" className="size-4" />,
  },
  {
    value: 'zed',
    label: 'Zed',
    logo: <IdeLogo ide="zed" className="size-4" />,
  },
  {
    value: 'kiro',
    label: 'Kiro',
    logo: <IdeLogo ide="kiro" className="size-4" />,
  },
  {
    value: 'windsurf',
    label: 'Windsurf',
    logo: <IdeLogo ide="windsurf" className="size-4" />,
  },
  {
    value: 'trae',
    label: 'Trae',
    logo: <IdeLogo ide="trae" className="size-4" />,
  },
  { value: 'other', label: 'Other' },
];

const IdeOptionButton = memo(
  ({
    option,
    isSelected,
    isDisabled,
    onSelect,
  }: {
    option: { value: OpenFilesInIde; label: string; logo?: React.ReactNode };
    isSelected: boolean;
    isDisabled: boolean;
    onSelect: (ide: OpenFilesInIde) => void;
  }) => {
    return (
      <button
        key={option.value}
        type="button"
        onClick={() => onSelect(option.value)}
        disabled={isDisabled}
        className={`glass-body flex shrink-0 flex-row items-center gap-3 rounded-xl p-2 transition-all ${
          isSelected
            ? 'border-primary bg-primary/10'
            : 'hover:border-primary/50'
        } ${isDisabled ? 'opacity-50' : 'glass-body-motion glass-body-motion-interactive cursor-pointer'}`}
      >
        {option.logo && option.logo}
        <span className="font-medium text-sm">{option.label}</span>
      </button>
    );
  },
);

export const AskForIdeToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForIdeTool'>;
    onSubmit: (input: { ide: OpenFilesInIde; type: 'askForIdeTool' }) => void;
    onCancel: () => void;
  }) => {
    const [selectedIde, setSelectedIde] = useState<OpenFilesInIde | null>(null);
    const [showAllOptions, setShowAllOptions] = useState(false);

    const isError = useMemo(() => {
      return toolPart.state === 'output-error';
    }, [toolPart.state]);

    const isInputAvailable = useMemo(() => {
      return toolPart.state === 'input-available';
    }, [toolPart.state]);

    const isOutputAvailable = useMemo(() => {
      return toolPart.state === 'output-available';
    }, [toolPart.state]);

    const primaryOptions = IDE_OPTIONS.slice(0, 2); // cursor and vscode

    const optionsToShow = useMemo(() => {
      if (showAllOptions) return IDE_OPTIONS;

      return primaryOptions;
    }, [primaryOptions, showAllOptions]);

    return (
      <div className="flex w-full flex-col gap-2">
        {/* Primary IDE Options (Cursor & VS Code) */}
        <div className="flex flex-col gap-2">
          {optionsToShow.map((option) => (
            <IdeOptionButton
              key={option.value}
              option={option}
              isSelected={selectedIde === option.value}
              isDisabled={isError || isOutputAvailable}
              onSelect={setSelectedIde}
            />
          ))}
        </div>

        {/* Show More Options Toggle */}
        {!showAllOptions && (
          <button
            type="button"
            onClick={() => setShowAllOptions(true)}
            disabled={isError || isOutputAvailable}
            className={`flex flex-row items-center justify-center gap-2 pb-2 text-muted-foreground text-xs transition-colors ${isError || isOutputAvailable ? 'opacity-50' : 'hover:text-foreground'}`}
          >
            <span>Show more options</span>
            <ChevronDownIcon className="size-4" />
          </button>
        )}

        {/* Action Buttons */}
        {(isInputAvailable || isError || isOutputAvailable) && (
          <div className="flex w-full flex-row items-center justify-end gap-2 pt-1">
            {isInputAvailable && (
              <>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={onCancel}
                  disabled={isError || isOutputAvailable}
                >
                  Skip Selection
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    if (selectedIde) {
                      onSubmit({
                        ide: selectedIde,
                        type: 'askForIdeTool',
                      });
                    }
                  }}
                  disabled={isError || isOutputAvailable || !selectedIde}
                >
                  Confirm
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
