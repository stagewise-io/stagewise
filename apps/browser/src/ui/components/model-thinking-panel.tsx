import { Button } from '@stagewise/stage-ui/components/button';
import {
  Radio,
  RadioGroup,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { Switch } from '@stagewise/stage-ui/components/switch';
import type { ModelThinkingOverride } from '@shared/karton-contracts/ui/shared-types';
import { useId } from 'react';
import { cn } from '@ui/utils';
import {
  getDefaultThinkingOption,
  getModelThinkingDisplayState,
  getModelThinkingOptions,
  type ModelThinkingDefaultOptions,
  type ThinkingPanelModel,
} from '@ui/utils/model-thinking';

export function ModelThinkingPanel({
  model,
  override,
  defaultOptions,
  onClose,
  onEnabledChange,
  onValueChange,
  onReset,
}: {
  model: ThinkingPanelModel;
  override: ModelThinkingOverride | undefined;
  defaultOptions?: ModelThinkingDefaultOptions;
  onClose?: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
  onReset: () => void;
}) {
  const labelId = useId();
  const display = getModelThinkingDisplayState(model, override, defaultOptions);
  if (!display) return null;

  const options = getModelThinkingOptions(model, defaultOptions);
  const defaultOption = getDefaultThinkingOption(model, defaultOptions);
  const hasOverride = display.isOverride;

  return (
    <>
      <div className="flex items-start justify-between gap-2 border-derived-subtle border-b px-2.5 py-2">
        <div className="min-w-0">
          <h4 className="truncate font-semibold text-foreground">Thinking</h4>
          <p className="truncate text-muted-foreground">
            {model.modelDisplayName}
          </p>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 px-1.5"
            onClick={onClose}
          >
            Close
          </Button>
        )}
      </div>

      <div className="space-y-3 px-2.5 pt-2.5 pb-1">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="min-w-0 cursor-pointer text-left"
            onClick={() => onEnabledChange(!display.enabled)}
          >
            <p id={labelId} className="font-medium text-foreground">
              Enable thinking
            </p>
            <p className="text-muted-foreground">Current: {display.label}</p>
          </button>
          <Switch
            checked={display.enabled}
            onCheckedChange={onEnabledChange}
            size="xs"
            aria-labelledby={labelId}
          />
        </div>

        <div
          className={cn(
            'space-y-2 transition-opacity',
            !display.enabled && 'opacity-50',
          )}
        >
          <div>
            <p className="font-medium text-foreground">Effort</p>
            <p className="text-muted-foreground">
              Default: {defaultOption.label}
            </p>
          </div>
          <RadioGroup
            value={display.value}
            onValueChange={(value) => {
              if (typeof value === 'string') onValueChange(value);
            }}
            disabled={!display.enabled}
            className="gap-1.5"
          >
            {options.map((option) => (
              <RadioLabel key={option.value} size="xs">
                <Radio value={option.value} size="xs" />
                <span>{option.label}</span>
                {option.value === defaultOption.value && (
                  <span className="text-muted-foreground">Default</span>
                )}
              </RadioLabel>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="flex justify-end px-2.5 pb-2.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-auto px-0 py-0 leading-none"
          disabled={!hasOverride}
          onClick={onReset}
        >
          Reset to default
        </Button>
      </div>
    </>
  );
}
