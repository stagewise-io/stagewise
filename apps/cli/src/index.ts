/**
 * This file contains the argument parser for the CLI.
 *
 * It exposes the parsed arguments as a single object.
 *
 * If subcommands are exexcuted by the user, this file will also trigger the execution of the subcommand.
 */

import { Command, InvalidArgumentError } from 'commander';
import {
  getTelemetryLevelCmdHandler,
  setTelemetryLevelCmdHandler,
} from './subcommands/telemetry';
import type { GlobalConfig } from '@/services/global-config';
import { Logger } from './services/logger';
import { GlobalDataPathService } from './services/global-data-path';
import { GlobalConfigService } from './services/global-config';
import { IdentifierService } from './services/identifier';
import { TelemetryService } from './services/telemetry';
import { AuthService } from '@/services/auth';
import { ExperienceStateService } from './services/experience-state';

// On start, we initialize a variety of basic services that will be used across all kinds of operational modes of the CLI.
const logger = new Logger(false);
const globalDataPathService = await GlobalDataPathService.create(logger);
const identifierService = await IdentifierService.create(globalDataPathService);
const globalConfigService = await GlobalConfigService.create(
  globalDataPathService,
  logger,
);
const telemetryService = new TelemetryService(
  identifierService,
  globalConfigService,
  logger,
);
const authService = await AuthService.create(globalDataPathService, logger);
const experienceStateService = new ExperienceStateService();

function myParseInt(value: string) {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue;
}

const program = new Command();

program
  .name('stagewise')
  .description('stagewise - Agentic frontend IDE')
  .version(process.env.CLI_VERSION ?? '0.0.1')
  .option<number>(
    '-p, --port [port]',
    'The port on which the stagewise UI will be exposed',
    myParseInt,
  )
  .option(
    '-a, --app-port <app-port>',
    'The port of the developed app to proxy. This will only be respected if stagewise is executed inside or with a path to a pre-configured workspace and will override the port defined in the workspace config.',
    myParseInt,
  )
  .option(
    '-w, --workspace <workspace>',
    'The path to the workspace that should be loaded on start. If empty, the current working directory will be loaded as a workspace.',
  )
  .option('-v, --verbose', 'Output debug information to the CLI')
  .option(
    '-b, --bridge',
    'Bridge mode (deprecated) - use stagewise without the built-in agent',
  )
  .action(
    (options: {
      port: number;
      appPort: number;
      workspace: string;
      verbose: boolean;
      bridge: boolean;
    }) => {
      // TODO: Call the handler for the main command
    },
  );

const telemetryCommand = program
  .command('telemetry')
  .description('Configure the telemetry level of stagewise.');

telemetryCommand
  .command('get')
  .action(getTelemetryLevelCmdHandler(globalConfigService));
telemetryCommand
  .command('set')
  .argument<GlobalConfig['telemetryLevel']>(
    '<level>',
    'The telemetry level to set',
    (val) => {
      if (
        !['off', 'anonymous', 'full'].includes(
          val as GlobalConfig['telemetryLevel'],
        )
      ) {
        throw new InvalidArgumentError('Invalid telemetry level.');
      }
      return val as GlobalConfig['telemetryLevel'];
    },
  )
  .action(setTelemetryLevelCmdHandler(globalConfigService));

// Default action for main program
program.action(() => {
  // TODO: Call the hander for the main app start
});

// Parse arguments
program.parse(process.argv);
