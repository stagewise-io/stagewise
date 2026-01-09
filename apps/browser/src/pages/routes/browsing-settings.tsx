import { createFileRoute } from '@tanstack/react-router';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { produceWithPatches, enablePatches } from 'immer';

enablePatches();
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';

export const Route = createFileRoute('/browsing-settings')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Browsing Settings',
      },
    ],
  }),
});

function Page() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  const telemetryMode = preferences.privacy.telemetryLevel;

  const handleTelemetryChange = async (value: string) => {
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.privacy.telemetryLevel = value as TelemetryLevel;
    });
    await updatePreferences(patches);
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border/30 border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">
            Browsing Settings
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent hover:scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 dark:hover:scrollbar-thumb-zinc-500 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Privacy Section */}
          <section className="space-y-6">
            <div>
              <h2 className="font-medium text-foreground text-lg">Privacy</h2>
              <p className="text-muted-foreground text-sm">
                Manage your privacy and data sharing preferences.
              </p>
            </div>

            {/* Telemetry */}
            <div className="space-y-3">
              <div>
                <h3 className="font-medium text-base text-foreground">
                  Telemetry
                </h3>
                <p className="text-muted-foreground text-sm">
                  Control what usage data is collected to help improve
                  stagewise.
                </p>
              </div>

              <RadioGroup
                value={telemetryMode}
                onValueChange={handleTelemetryChange}
              >
                <RadioLabel>
                  <Radio value="full" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Full</span>
                    <span className="text-muted-foreground text-xs">
                      Send all telemetry data including usage patterns and
                      diagnostics
                    </span>
                  </div>
                </RadioLabel>

                <RadioLabel>
                  <Radio value="anonymous" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      Anonymous
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Send anonymized telemetry data without personal
                      identifiers
                    </span>
                  </div>
                </RadioLabel>

                <RadioLabel>
                  <Radio value="off" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Off</span>
                    <span className="text-muted-foreground text-xs">
                      Don't send any telemetry data
                    </span>
                  </div>
                </RadioLabel>
              </RadioGroup>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
