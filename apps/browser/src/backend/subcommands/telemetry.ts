/**
 * This file contains the handling for the telemetry subcommand.
 *
 * It is responsible for setting the telemetry level from CLI.
 */

import { bootstrapGlobalServices } from '@/global-service-bootstrap';
import type { GlobalConfig } from '@shared/karton-contracts/ui/shared-types';

export async function getTelemetryLevelCmdHandler() {
  const globalServices = await bootstrapGlobalServices({});
  const telemetryLevel =
    globalServices.globalConfigService.get().telemetryLevel;
  console.log('The currently configured telemetry level is: ', telemetryLevel);
}

export async function setTelemetryLevelCmdHandler(
  telemetryLevel: GlobalConfig['telemetryLevel'],
) {
  const globalServices = await bootstrapGlobalServices({});

  const config = globalServices.globalConfigService.get();
  if (config.telemetryLevel === telemetryLevel) {
    console.log('The telemetry level is already set to: ', telemetryLevel);
    return;
  }
  config.telemetryLevel = telemetryLevel;
  await globalServices.globalConfigService.set(config);
  console.log('The telemetry level has been set to: ', telemetryLevel);
}
