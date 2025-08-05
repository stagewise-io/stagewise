import type { RouterOutputs } from '@stagewise/api-client';
import table from 'cli-table3';
import { log } from './logger.js';
import chalk from 'chalk';
import type { Plugin } from '../server/plugin-loader.js';

type Subscription = RouterOutputs['subscription']['getSubscription'];

function createCreditStatusBar(available: number, total: number): string {
  const barWidth = 25;
  const percentage = total > 0 ? available / total : 0;
  const filledWidth = Math.round(percentage * barWidth);
  const emptyWidth = barWidth - filledWidth;

  // Use Unicode block characters for the progress bar
  const filledChar = '-';
  const emptyChar = '-';

  // ANSI color codes
  const lightGreen = '\x1b[92m'; // Light green
  const grey = '\x1b[90m'; // Grey
  const reset = '\x1b[0m'; // Reset

  const filledBar = lightGreen + filledChar.repeat(filledWidth) + reset;
  const emptyBar = grey + emptyChar.repeat(emptyWidth) + reset;

  return `${filledBar}${emptyBar} ${(available / (100 * 100)).toFixed(1)}/${(total / (100 * 100)).toFixed(1)}€`;
}

type StartupBannerProps = {
  subscription: Subscription | null;
  loadedPlugins: Plugin[];
  email: string;
  appPort: number;
  proxyPort: number;
};

export function startupBanner({ subscription, email }: StartupBannerProps) {
  const noSubscriptionText = 'No subscription';
  const t = new table({
    head: [
      chalk.cyan.bold('Email'),
      chalk.cyan.bold('Status'),
      chalk.cyan.bold('Credits'),
    ],
    colWidths: [
      email.length + 4,
      subscription?.subscription?.status?.length ||
        noSubscriptionText.length + 4,
      43,
    ],
  });
  t.push([
    email,
    subscription?.subscription?.status || noSubscriptionText,
    `${createCreditStatusBar(
      subscription?.credits.available ?? 0,
      subscription?.credits.total ?? 0,
    )}\n${chalk.grey('Get more at https://console.stagewise.io')}`,
  ]);
  log.info(t.toString());
}
