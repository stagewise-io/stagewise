import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_FILENAMES,
} from './allowed-rag-extensions.js';
import { createHash } from 'node:crypto';
import { LevelDb } from './typed-db.js';
import { RAG_VERSION } from '../index.js';

export type FileManifest = {
  relativePath: string;
  contentHash: string;
  ragVersion: number;
  indexedAt: number;
};

async function getLocalFilesManifests(
  clientRuntime: ClientRuntime,
  onError?: (error: Error) => void,
): Promise<FileManifest[]> {
  const allFiles = new Set<string>();

  // Pattern for extensions: **/*.{js,ts,json,...}
  if (ALLOWED_EXTENSIONS.size > 0) {
    const extensionPattern = `**/*.{${Array.from(ALLOWED_EXTENSIONS).join(',')}}`;
    const extensionFiles = await clientRuntime.fileSystem.glob(
      extensionPattern,
      {},
    );

    if (!extensionFiles.success) {
      throw new Error(
        `Failed to get files with extensions: ${extensionFiles.message}`,
      );
    }

    for (const file of extensionFiles.relativePaths ?? []) {
      allFiles.add(file);
    }
  }

  // Pattern for specific filenames: we need to glob each one
  // Using a pattern like **/{.eslintrc,package.json,...}
  if (ALLOWED_FILENAMES.size > 0) {
    const filenamePattern = `**/{${Array.from(ALLOWED_FILENAMES).join(',')}}`;
    const filenameFiles = await clientRuntime.fileSystem.glob(
      filenamePattern,
      {},
    );

    if (!filenameFiles.success) {
      // Log warning but don't fail - some projects might not have these files
      onError?.(
        new Error(`Failed to get specific filenames: ${filenameFiles.message}`),
      );
    } else {
      for (const file of filenameFiles.relativePaths ?? []) {
        allFiles.add(file);
      }
    }
  }

  const manifests: FileManifest[] = [];

  for (const file of allFiles) {
    const manifest = await getFileManifestContent(clientRuntime, file);
    if (!manifest) {
      onError?.(new Error(`Failed to get file manifest for: ${file}`));
      continue;
    }
    manifests.push(manifest);
  }

  return manifests;
}

async function getStoredFilesManifests(
  workspaceDataPath: string,
): Promise<FileManifest[] | { error: 'table_not_found' | 'unknown_error' }> {
  const db = LevelDb.getInstance(workspaceDataPath);
  const manifests: FileManifest[] = [];
  try {
    await db.open();
    for await (const [_, value] of db.manifests.iterator()) {
      manifests.push(value as FileManifest);
    }
    await db.close();
    return manifests;
  } catch (_error) {
    await db.close();
    return { error: 'unknown_error' };
  }
}

async function compareFileManifests(
  localManifests: FileManifest[],
  storedManifests: FileManifest[],
): Promise<{
  toAdd: FileManifest[];
  toRemove: FileManifest[];
  toUpdate: FileManifest[];
}> {
  const toAdd: FileManifest[] = [];
  const toUpdate: FileManifest[] = [];
  const toRemove: FileManifest[] = [];

  for (const manifest of localManifests) {
    const storedManifest = storedManifests.find(
      (s) => s.relativePath === manifest.relativePath,
    );

    if (!storedManifest) {
      toAdd.push(manifest);
    } else if (
      storedManifest.contentHash !== manifest.contentHash ||
      storedManifest.ragVersion !== manifest.ragVersion
    ) {
      toUpdate.push(manifest);
    }
  }

  for (const manifest of storedManifests) {
    if (!localManifests.some((l) => l.relativePath === manifest.relativePath)) {
      toRemove.push(manifest);
    }
  }

  return { toAdd, toUpdate, toRemove };
}

async function getFileManifestContent(
  clientRuntime: ClientRuntime,
  filepath: string,
): Promise<FileManifest | null> {
  const content = await clientRuntime.fileSystem.readFile(filepath);
  if (!content.success) return null;

  return {
    relativePath: filepath,
    contentHash: createHash('sha256')
      .update(content.content ?? '')
      .digest('hex'),
    ragVersion: RAG_VERSION,
    indexedAt: Date.now(),
  };
}

export async function createStoredFileManifest(
  workspaceDataPath: string,
  clientRuntime: ClientRuntime,
  relativePath: string,
): Promise<void> {
  const manifest = await getFileManifestContent(clientRuntime, relativePath);
  if (!manifest) {
    throw new Error(`Failed to get file manifest: ${relativePath}`);
  }
  const db = LevelDb.getInstance(workspaceDataPath);
  await db.open();
  try {
    await db.manifests.put(relativePath, manifest);
  } finally {
    await db.close();
  }
}

export async function deleteStoredFileManifest(
  relativePath: string,
  workspaceDataPath: string,
): Promise<void> {
  const db = LevelDb.getInstance(workspaceDataPath);
  await db.open();
  try {
    await db.manifests.del(relativePath);
  } finally {
    await db.close();
  }
}

/**
 * Batch version of createStoredFileManifest that keeps the database open
 * for multiple operations. More efficient for bulk operations.
 */
export async function createStoredFileManifestBatch(
  workspaceDataPath: string,
  clientRuntime: ClientRuntime,
  relativePaths: string[],
): Promise<{
  succeeded: string[];
  failed: Array<{ path: string; error: Error }>;
}> {
  const db = LevelDb.getInstance(workspaceDataPath);
  await db.open();

  const succeeded: string[] = [];
  const failed: Array<{ path: string; error: Error }> = [];

  try {
    for (const relativePath of relativePaths) {
      try {
        const manifest = await getFileManifestContent(
          clientRuntime,
          relativePath,
        );
        if (!manifest) {
          failed.push({
            path: relativePath,
            error: new Error(`Failed to get file manifest: ${relativePath}`),
          });
          continue;
        }
        await db.manifests.put(relativePath, manifest);
        succeeded.push(relativePath);
      } catch (error) {
        failed.push({ path: relativePath, error: error as Error });
      }
    }
  } finally {
    await db.close();
  }

  return { succeeded, failed };
}

/**
 * Batch version of deleteStoredFileManifest that keeps the database open
 * for multiple operations. More efficient for bulk operations.
 */
export async function deleteStoredFileManifestBatch(
  filepaths: string[],
  workspaceDataPath: string,
): Promise<{
  succeeded: string[];
  failed: Array<{ path: string; error: Error }>;
}> {
  const db = LevelDb.getInstance(workspaceDataPath);
  await db.open();

  const succeeded: string[] = [];
  const failed: Array<{ path: string; error: Error }> = [];

  try {
    for (const filepath of filepaths) {
      try {
        await db.manifests.del(filepath);
        succeeded.push(filepath);
      } catch (error) {
        failed.push({ path: filepath, error: error as Error });
      }
    }
  } finally {
    await db.close();
  }

  return { succeeded, failed };
}

export async function getRagFilesDiff(
  workspaceDataPath: string,
  clientRuntime: ClientRuntime,
  onError?: (error: Error) => void,
): Promise<{
  toAdd: FileManifest[];
  toRemove: FileManifest[];
  toUpdate: FileManifest[];
}> {
  const localManifests = await getLocalFilesManifests(clientRuntime, onError);
  const storedManifests = await getStoredFilesManifests(workspaceDataPath);
  if ('error' in storedManifests) {
    return {
      toAdd: localManifests,
      toRemove: [],
      toUpdate: [],
    };
  }
  return compareFileManifests(localManifests, storedManifests);
}
