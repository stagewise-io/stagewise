/**
 * This file contains the handling for the telemetry subcommand.
 *
 * It is responsible for setting the telemetry level from CLI.
 */

import type {
  GlobalConfig,
  GlobalConfigService,
} from '@/services/global-config';

export function getTelemetryLevelCmdHandler(
  globalConfigService: GlobalConfigService,
) {
  // TODO: Implement the logic to get the telemetry level
  return () => {
    const telemetryLevel = globalConfigService.get().telemetryLevel;
    console.log(
      'The currently configured telemetry level is: ',
      telemetryLevel,
    );
  };
}

export function setTelemetryLevelCmdHandler(
  globalConfigService: GlobalConfigService,
) {
  // TODO: Implement the logic to set the telemetry level
  return async ({ level }: { level: GlobalConfig['telemetryLevel'] }) => {
    const config = globalConfigService.get();
    if (config.telemetryLevel === level) {
      console.log('The telemetry level is already set to: ', level);
      return;
    }
    config.telemetryLevel = level;
    await globalConfigService.set(config);
    console.log('The telemetry level has been set to: ', level);
  };
}
