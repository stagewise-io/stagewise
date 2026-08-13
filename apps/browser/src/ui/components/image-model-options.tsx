import {
  IMAGE_GENERATION_SETTINGS,
  type ImageGenerationSettingField,
  type ImageModelSelectorEntry,
} from '@shared/available-image-models';
import type { ImageGenerationSettings } from '@stagewise/agent-core/types/agent';
import {
  Radio,
  RadioGroup,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';

const AUTO_VALUE = '@@auto@@';

export function formatImageGenerationSettings(
  settings: ImageGenerationSettings = {},
): string {
  return IMAGE_GENERATION_SETTINGS.map(({ field }) => settings[field])
    .filter(Boolean)
    .join(' · ');
}

export function ImageModelOptions({
  entry,
  settings,
  onChange,
}: {
  entry: ImageModelSelectorEntry;
  settings?: ImageGenerationSettings;
  onChange: (
    field: ImageGenerationSettingField,
    value: string | undefined,
  ) => void;
}) {
  return (
    <div
      role="region"
      aria-label={`Image settings for ${entry.displayName}`}
      className="flex shrink-0 flex-col"
    >
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="font-semibold">{entry.displayName}</div>
        {entry.description ? (
          <div className="text-muted-foreground">{entry.description}</div>
        ) : null}
        <div className="text-[10px] text-subtle-foreground">
          {entry.instanceName}
        </div>
      </div>

      {IMAGE_GENERATION_SETTINGS.map(({ parameter, field, label }) => {
        const options = entry.supportedParameters[parameter]?.filter(
          (option) => {
            if (
              field === 'outputFormat' &&
              settings?.background === 'transparent'
            )
              return option !== 'jpeg' && option !== 'jpg';
            if (field === 'background' && option === 'transparent')
              return (
                settings?.outputFormat !== 'jpeg' &&
                settings?.outputFormat !== 'jpg'
              );
            return true;
          },
        );
        if (!options?.length) return null;
        return (
          <div
            key={field}
            className="shrink-0 border-derived-subtle border-t px-2.5 py-2"
          >
            <div className="mb-1.5 font-medium text-foreground">{label}</div>
            <RadioGroup
              value={settings?.[field] ?? AUTO_VALUE}
              aria-label={`${label} for ${entry.displayName}`}
              className="gap-1"
              onValueChange={(next) =>
                onChange(field, next === AUTO_VALUE ? undefined : String(next))
              }
            >
              <RadioLabel size="xs" className="rounded-md px-1 py-0.5">
                <Radio value={AUTO_VALUE} size="xs" />
                <span>Auto</span>
              </RadioLabel>
              {options.map((option) => (
                <RadioLabel
                  key={option}
                  size="xs"
                  className="rounded-md px-1 py-0.5"
                >
                  <Radio value={option} size="xs" />
                  <span>{option}</span>
                </RadioLabel>
              ))}
            </RadioGroup>
          </div>
        );
      })}
    </div>
  );
}
