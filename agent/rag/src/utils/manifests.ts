import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { ALLOWED_EXTENSIONS } from './allowed-extensions.js';
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
  const globalPattern = `**/*{${Array.from(ALLOWED_EXTENSIONS).join(',')}}`;

  const files = await clientRuntime.fileSystem.glob(globalPattern, {});

  if (!files.success) {
    throw new Error(`Failed to get files manifest: ${files.message}`);
  }

  const manifests: FileManifest[] = [];

  for (const file of files.paths ?? []) {
    const manifest = await getFileManifest(clientRuntime, file);
    if (!manifest) {
      throw new Error(`Failed to get file manifest: ${file}`);
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
