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
import type { GlobalConfig } from '@stagewise/karton-contract/shared-types';
import { main } from './main';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
    (val) => {
      // make sure the path exists
      if (!existsSync(val)) {
        throw new InvalidArgumentError('Workspace path does not exist.');
      }
      // return absolute path
      return resolve(val);
    },
  )
  .option('--no-workspace-on-start', 'Do not load a workspace on start.')
  .option('-v, --verbose', 'Output debug information to the CLI')
  .option(
    '-b, --bridge',
    'Bridge mode (deprecated) - use stagewise without the built-in agent',
  )
  .action(
    async (options: {
      port: number;
      appPort: number;
      workspace: string;
      verbose: boolean;
      bridge: boolean;
      workspaceOnStart: boolean;
    }) => {
      await main({
        launchOptions: {
          port: options.port,
          appPort: options.appPort,
          workspacePath: options.workspace,
          verbose: options.verbose,
          bridgeMode: options.bridge,
          workspaceOnStart: options.workspaceOnStart,
        },
      });
    },
  );

const telemetryCommand = program
  .command('telemetry')
  .description('Configure the telemetry level of stagewise.');

telemetryCommand.command('get').action(getTelemetryLevelCmdHandler);
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
  .action(setTelemetryLevelCmdHandler);

// Parse arguments
program.parse(process.argv);
