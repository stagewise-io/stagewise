#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { getRepoRoot } from './git-utils.js';

const exec = promisify(execCallback);
const NIGHTLY_COUNTER_PADDING = 3;
const NIGHTLY_COUNTER_MAX = 10 ** NIGHTLY_COUNTER_PADDING - 1;

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function isValidNightlyDate(value: string): boolean {
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatCounter(counter: number): string {
  if (
    !Number.isInteger(counter) ||
    counter < 1 ||
    counter > NIGHTLY_COUNTER_MAX
  ) {
    throw new Error(
      `Nightly counter must be an integer between 1 and ${NIGHTLY_COUNTER_MAX}`,
    );
  }
  return String(counter).padStart(NIGHTLY_COUNTER_PADDING, '0');
}

async function getStablePackageVersion(): Promise<string> {
  const repoRoot = await getRepoRoot();
  const packageJsonPath = path.join(repoRoot, 'apps/browser/package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  const version = packageJson.version;
  if (typeof version !== 'string' || !semver.valid(version)) {
    throw new Error(`Invalid stagewise package version: ${String(version)}`);
  }
  return version;
}

async function getNextCounter(
  baseVersion: string,
  date: string,
): Promise<number> {
  const tagPrefix = `stagewise@${baseVersion}-nightly${date}c`;
  const { stdout } = await exec(
    `git tag --list "${tagPrefix}*" --sort=-version:refname`,
  );
  const counters = stdout
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.match(/nightly\d{8}c(\d{3})$/)?.[1])
    .filter((counter): counter is string => Boolean(counter))
    .map((counter) => Number.parseInt(counter, 10))
    .filter((counter) => Number.isInteger(counter));

  const maxCounter = counters.length > 0 ? Math.max(...counters) : 0;
  return maxCounter + 1;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      date: { type: 'string' },
      counter: { type: 'string' },
      'github-output': { type: 'boolean', default: false },
    },
  });

  const stableVersion = await getStablePackageVersion();
  const stableCore = semver.coerce(stableVersion);
  if (!stableCore) {
    throw new Error(`Invalid stable version: ${stableVersion}`);
  }

  const baseVersion = semver.inc(stableCore, 'patch');
  if (!baseVersion) {
    throw new Error(
      `Failed to compute next patch version from ${stableVersion}`,
    );
  }

  const date = values.date ?? formatDate(new Date());
  if (!/^\d{8}$/.test(date) || !isValidNightlyDate(date)) {
    throw new Error(`Invalid nightly date: ${date}. Expected YYYYMMDD.`);
  }

  if (values.counter && !/^\d+$/.test(values.counter)) {
    throw new Error(`Invalid nightly counter: ${values.counter}`);
  }

  const counter = values.counter
    ? Number.parseInt(values.counter, 10)
    : await getNextCounter(baseVersion, date);
  const version = `${baseVersion}-nightly${date}c${formatCounter(counter)}`;
  const tag = `stagewise@${version}`;

  if (!semver.valid(version)) {
    throw new Error(`Generated invalid nightly version: ${version}`);
  }

  if (values['github-output']) {
    console.log(`version=${version}`);
    console.log(`tag=${tag}`);
    return;
  }

  console.log(JSON.stringify({ version, tag }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
