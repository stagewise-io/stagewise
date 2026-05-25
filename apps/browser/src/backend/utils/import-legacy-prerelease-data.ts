import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../services/logger';
import { getDataRoot } from './paths';

declare const __APP_RELEASE_CHANNEL__:
  | 'dev'
  | 'prerelease'
  | 'nightly'
  | 'release';

const LEGACY_PRERELEASE_BASE_NAME = 'stagewise-prerelease';
const DATA_ROOT_DIR_NAME = 'stagewise';
const MIGRATION_MARKER_RELATIVE_PATH = path.join(
  '.migrations',
  'prerelease-import.json',
);

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return true;
    return false;
  }
}

async function writeMigrationMarker(
  targetDataRoot: string,
  sourceDataRoot: string,
): Promise<void> {
  const markerPath = path.join(targetDataRoot, MIGRATION_MARKER_RELATIVE_PATH);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(
    markerPath,
    `${JSON.stringify(
      {
        sourceDataRoot,
        targetDataRoot,
        importedAt: new Date().toISOString(),
        releaseChannel: __APP_RELEASE_CHANNEL__,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );
}

export async function importLegacyPrereleaseData(
  logger: Logger,
): Promise<void> {
  if (
    __APP_RELEASE_CHANNEL__ !== 'release' &&
    __APP_RELEASE_CHANNEL__ !== 'nightly'
  ) {
    logger.debug(
      `[LegacyPrereleaseImport] Skipping for ${__APP_RELEASE_CHANNEL__} build`,
    );
    return;
  }

  const sourceDataRoot = path.join(
    app.getPath('appData'),
    LEGACY_PRERELEASE_BASE_NAME,
    DATA_ROOT_DIR_NAME,
  );
  const targetDataRoot = getDataRoot();

  if (sourceDataRoot === targetDataRoot) {
    logger.debug(
      '[LegacyPrereleaseImport] Source and target data roots are identical, skipping',
    );
    return;
  }

  if (!(await pathExists(sourceDataRoot))) {
    logger.debug(
      `[LegacyPrereleaseImport] No legacy prerelease data found at ${sourceDataRoot}`,
    );
    return;
  }

  const targetExists = await pathExists(targetDataRoot);
  if (targetExists && !(await isDirectoryEmpty(targetDataRoot))) {
    logger.debug(
      `[LegacyPrereleaseImport] Target data root already exists and is non-empty at ${targetDataRoot}, skipping`,
    );
    return;
  }

  const targetParent = path.dirname(targetDataRoot);
  const tempTarget = path.join(
    targetParent,
    `${path.basename(targetDataRoot)}.importing-${process.pid}-${Date.now()}`,
  );

  try {
    await fs.mkdir(targetParent, { recursive: true });
    await fs.rm(tempTarget, { recursive: true, force: true });
    await fs.cp(sourceDataRoot, tempTarget, {
      recursive: true,
      errorOnExist: false,
      force: false,
    });
    await writeMigrationMarker(tempTarget, sourceDataRoot);

    if (targetExists) {
      await fs.rmdir(targetDataRoot);
    }
    await fs.rename(tempTarget, targetDataRoot);

    logger.info(
      `[LegacyPrereleaseImport] Imported legacy prerelease data from ${sourceDataRoot} to ${targetDataRoot}`,
    );
  } catch (error) {
    await fs.rm(tempTarget, { recursive: true, force: true }).catch(() => {});
    logger.warn(
      `[LegacyPrereleaseImport] Failed to import legacy prerelease data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
