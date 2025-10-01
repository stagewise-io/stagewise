/**
 * This file contains the handling for the telemetry subcommand.
 *
 * It is responsible for setting the telemetry level from CLI.
 */

import type { GlobalConfig } from '@/services/global-config';
import { bootstrapGlobalServices } from '@/global-service-bootstrap';

export async function getTelemetryLevelCmdHandler() {
  const globalServices = await bootstrapGlobalServices({});
  const telemetryLevel =
    globalServices.globalConfigService.get().telemetryLevel;
  console.log('The currently configured telemetry level is: ', telemetryLevel);
}

export async function setTelemetryLevelCmdHandler({
  level,
}: {
  level: GlobalConfig['telemetryLevel'];
}) {
  const globalServices = await bootstrapGlobalServices({});

  const config = globalServices.globalConfigService.get();
  if (config.telemetryLevel === level) {
    console.log('The telemetry level is already set to: ', level);
    return;
  }
  config.telemetryLevel = level;
  await globalServices.globalConfigService.set(config);
  console.log('The telemetry level has been set to: ', level);
}
