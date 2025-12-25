import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';

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
  const [telemetryMode, setTelemetryMode] = useState<string>('full');

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
          {/* Telemetry Section */}
          <section className="space-y-4">
            <div>
              <h2 className="font-medium text-foreground text-lg">Telemetry</h2>
              <p className="text-muted-foreground text-sm">
                Control what usage data is collected to help improve stagewise.
              </p>
            </div>

            <RadioGroup
              value={telemetryMode}
              onValueChange={(value) => setTelemetryMode(value as string)}
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
                  <span className="font-medium text-foreground">Anonymous</span>
                  <span className="text-muted-foreground text-xs">
                    Send anonymized telemetry data without personal identifiers
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
          </section>
        </div>
      </div>
    </div>
  );
}
