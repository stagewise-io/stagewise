import { SearchableSelect } from '@stagewise/stage-ui/components/searchable-select';
import { IconBrainOutline18 } from 'nucleo-ui-outline-18';
import { availableModels } from '@shared/available-models';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';

const modelOptions = availableModels.map((model) => ({
  label: model.modelDisplayName,
  value: model.modelId,
  icon:
    'thinkingEnabled' in model && model.thinkingEnabled ? (
      <IconBrainOutline18 className="size-3 text-muted-foreground" />
    ) : null,
  tooltipContent: (
    <ModelTooltipContent
      model={model.modelDisplayName}
      description={model.modelDescription}
      context={model.modelContext}
    />
  ),
}));

function ModelTooltipContent({
  model,
  description,
  context,
}: {
  model: string;
  description: string;
  context: string;
}): React.ReactNode {
  return (
    <div className="flex w-48 flex-col gap-1.5">
      <div className="font-semibold">{model}</div>
      <div className="text-muted-foreground">{description}</div>
      <div className="text-[10px] text-muted-foreground/70">{context}</div>
    </div>
  );
}

interface ModelSelectProps {
  onModelChange?: () => void;
}

export function ModelSelect({ onModelChange }: ModelSelectProps) {
  const selectedModel = useKartonState((s) => s.agentChat.selectedModel);
  const setSelectedModel = useKartonProcedure(
    (p) => p.agentChat.setSelectedModel,
  );

  return (
    <SearchableSelect
      side="top"
      value={selectedModel.modelId as string}
      onValueChange={(value) => {
        setSelectedModel(value as string);
        onModelChange?.();
      }}
      items={modelOptions}
      size="xs"
      triggerClassName="w-auto min-w-0"
    />
  );
}
