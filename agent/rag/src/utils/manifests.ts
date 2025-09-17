import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_FILENAMES,
} from './allowed-rag-extensions.js';
import { createHash } from 'node:crypto';
import { Level } from 'level';
import path from 'node:path';
import { RAG_VERSION } from '../index.js';

function getDatabasePath(clientRuntime: ClientRuntime): string {
  return path.join(
    clientRuntime.fileSystem.getCurrentWorkingDirectory(),
    '.stagewise',
    'local-files-manifests.db',
  );
}

export type FileManifest = {
  path: string;
  contentHash: string;
  ragVersion: number;
  indexedAt: number;
};

async function getLocalFilesManifests(
  clientRuntime: ClientRuntime,
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

    for (const file of extensionFiles.paths ?? []) {
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
      console.warn(
        `Warning: Failed to get specific filenames: ${filenameFiles.message}`,
      );
    } else {
      for (const file of filenameFiles.paths ?? []) {
        allFiles.add(file);
      }
    }
  }

  const manifests: FileManifest[] = [];

  for (const file of allFiles) {
    const manifest = await getFileManifest(clientRuntime, file);
    if (!manifest) {
      console.warn(`Failed to get file manifest for: ${file}`);
      continue;
    }
    manifests.push(manifest);
  }

  return manifests;
}

async function getStoredFilesManifests(
  clientRuntime: ClientRuntime,
): Promise<FileManifest[] | { error: 'table_not_found' | 'unknown_error' }> {
  const databasePath = getDatabasePath(clientRuntime);
  const db = new Level<string, FileManifest>(databasePath, {
    valueEncoding: 'json',
  });
  const manifests: FileManifest[] = [];
  try {
    for await (const [_, value] of db.iterator()) {
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
      (s) => s.path === manifest.path,
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
    if (!localManifests.some((l) => l.path === manifest.path)) {
      toRemove.push(manifest);
    }
  }

  return { toAdd, toUpdate, toRemove };
}

async function getFileManifest(
  clientRuntime: ClientRuntime,
  filepath: string,
): Promise<FileManifest | null> {
  const content = await clientRuntime.fileSystem.readFile(filepath);
  if (!content.success) return null;

  return {
    path: filepath,
    contentHash: createHash('sha256')
      .update(content.content ?? '')
      .digest('hex'),
    ragVersion: RAG_VERSION,
    indexedAt: Date.now(),
  };
}

export async function createStoredFileManifest(
  clientRuntime: ClientRuntime,
  filepath: string,
): Promise<void> {
  const manifest = await getFileManifest(clientRuntime, filepath);
  if (!manifest) {
    throw new Error(`Failed to get file manifest: ${filepath}`);
  }
  const db = new Level<string, FileManifest>(getDatabasePath(clientRuntime), {
    valueEncoding: 'json',
  });
  await db.put(filepath, manifest);
  await db.close();
}

export async function deleteStoredFileManifest(
  filepath: string,
  clientRuntime: ClientRuntime,
): Promise<void> {
  const db = new Level<string, FileManifest>(getDatabasePath(clientRuntime), {
    valueEncoding: 'json',
  });
  await db.del(filepath);
  await db.close();
}

export async function getRagFilesDiff(clientRuntime: ClientRuntime): Promise<{
  toAdd: FileManifest[];
  toRemove: FileManifest[];
  toUpdate: FileManifest[];
}> {
  const localManifests = await getLocalFilesManifests(clientRuntime);
  const storedManifests = await getStoredFilesManifests(clientRuntime);
  if ('error' in storedManifests) {
    return {
      toAdd: localManifests,
      toRemove: [],
      toUpdate: [],
    };
  }
  return compareFileManifests(localManifests, storedManifests);
}
