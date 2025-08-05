import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';

interface PromptOptions {
  message: string;
  hint?: string;
  placeholder?: string;
  default?: string | number | boolean;
}

export const promptNumber = async (options: PromptOptions): Promise<number> => {
  const { message, default: defaultValue } = options;

  const promptMessage = `${message}`;

  const result = await input({
    message: chalk.cyan(promptMessage),
    default: chalk.gray(defaultValue?.toString()),
    theme: {
      prefix: { idle: chalk.cyan('› '), done: chalk.green('✓ ') },
      style: {
        answer: (text: string) => chalk.green(text),
        message: (text: string) => chalk.gray(text),
        defaultAnswer: (text: string) => chalk.gray(text),
      },
    },
  });

  const parsed =
    Number.parseInt(result, 10) ||
    Number.parseInt(defaultValue?.toString() || '', 10);

  if (Number.isNaN(parsed)) {
    throw new Error('Invalid number provided');
  }

  return parsed;
};

export const promptConfirm = async (
  options: PromptOptions,
): Promise<boolean> => {
  const { message, default: defaultValue } = options;

  const promptMessage = `${message}`;

  return await confirm({
    message: chalk.cyan(promptMessage),
    theme: {
      prefix: { idle: chalk.cyan('› '), done: chalk.green('✓ ') },
      style: {
        answer: (text: string) => chalk.green(text),
        message: (text: string) => chalk.cyan(text),
        defaultAnswer: (text: string) => chalk.gray(text),
      },
    },
    default: defaultValue as boolean | undefined,
  });
};
