import {
  FormField,
  FormFieldDescription,
  FormFieldLabel,
  FormFieldSeparator,
  FormFieldset,
} from '@stagewise/stage-ui/components/form';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { useKartonState } from '@/hooks/use-karton';

export const SettingsPanel = () => {
  const _globalConfig = useKartonState((s) => s.globalConfig);

  return (
    <div className="glass-body flex size-full flex-col items-stretch justify-start overflow-hidden rounded-xl p-4">
      <FormFieldset title="Telemetry">
        <FormFieldSeparator />
        <FormField className="w-full flex-row items-center">
          <div className="flex flex-1 flex-col gap-2">
            <FormFieldLabel>Telemetry level</FormFieldLabel>
            <FormFieldDescription>
              Configure, how much data you are willing to send to stagewise.
            </FormFieldDescription>
          </div>
          <Switch />
        </FormField>
        <FormField className="w-full flex-row items-center">
          <div className="flex flex-1 flex-col gap-2">
            <FormFieldLabel>Telemetry level</FormFieldLabel>
            <FormFieldDescription>
              Configure, how much data you are willing to send to stagewise.
            </FormFieldDescription>
          </div>
          <Switch />
        </FormField>
        <FormFieldSeparator />
      </FormFieldset>
    </div>
  );
};
