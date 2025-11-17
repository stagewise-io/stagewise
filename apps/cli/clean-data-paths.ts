#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import envPaths from 'env-paths';
import chalk from 'chalk';

/**
 * Clean script to delete all stagewise CLI data paths
 * Uses the EXACT same path resolution logic as GlobalDataPathService:
 * - dev mode → envPaths('stagewise-dev', { suffix: '' })
 * - prod mode → envPaths('stagewise', { suffix: '' })
 */
async function cleanDataPaths(mode: 'dev' | 'prod') {
  // Use the same logic as GlobalDataPathService to determine app name
  const appName = mode === 'dev' ? 'stagewise-dev' : 'stagewise';
  const paths = envPaths(appName, { suffix: '' });

  console.log(
    chalk.yellow(
      `\n🧹 Cleaning stagewise ${mode.toUpperCase()} data paths...\n`,
    ),
  );

  const directoriesToDelete = [
    { name: 'Config', path: paths.config },
    { name: 'Data', path: paths.data },
    { name: 'Cache', path: paths.cache },
    { name: 'Temp', path: paths.temp },
  ];

  let deletedCount = 0;
  let errorCount = 0;

  for (const { name, path } of directoriesToDelete) {
    try {
      await fs.access(path);
      await fs.rm(path, { recursive: true, force: true });
      console.log(chalk.green(`✓ Deleted ${name} directory: ${path}`));
      deletedCount++;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        console.log(chalk.gray(`- ${name} directory not found: ${path}`));
      } else {
        console.log(
          chalk.red(`✗ Failed to delete ${name} directory: ${err.message}`),
        );
        errorCount++;
      }
    }
  }

  console.log(chalk.blue('\n📁 Data locations that were processed:'));
  console.log(chalk.gray(`  Config: ${paths.config}`));
  console.log(chalk.gray(`  Data: ${paths.data}`));
  console.log(chalk.gray(`  Cache: ${paths.cache}`));
  console.log(chalk.gray(`  Temp: ${paths.temp}`));

  if (errorCount === 0) {
    console.log(
      chalk.green(
        `\n✅ Clean complete! ${deletedCount} directories processed.`,
      ),
    );
    console.log(
      chalk.gray(
        'All workspace data, global config, telemetry settings, authentication data, and cached files have been cleared.',
      ),
    );
  } else {
    console.log(
      chalk.yellow(`\n⚠️  Clean completed with ${errorCount} errors.`),
    );
    process.exit(1);
  }
}

// Get mode from command line argument
const mode = process.argv[2] as 'dev' | 'prod';

if (!mode || (mode !== 'dev' && mode !== 'prod')) {
  console.error(
    chalk.red('\n❌ Invalid mode. Usage: tsx clean-data-paths.ts <dev|prod>'),
  );
  process.exit(1);
}

// Run the clean
cleanDataPaths(mode).catch((error) => {
  console.error(chalk.red('\n❌ Clean failed:'), error.message);
  process.exit(1);
});
