import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import OpenAI from 'openai';
import {
  type FileEmbedding,
  generateEmbedding,
  generateFileEmbeddings,
} from './utils/embeddings.js';
import {
  getRagFilesDiff,
  deleteStoredFileManifestBatch,
  createStoredFileManifest,
} from './utils/manifests.js';
import {
  connectToDatabase,
  deleteFileRecords,
  addFileRecord,
  getAllIndexedFilePaths,
  searchSimilarFiles,
  getRagMetadata as getRagMetadataFromDb,
} from './utils/rag-db.js';

import { LevelDb, RAG_VERSION } from './index.js';

export type RagUpdate = {
  progress: number;
  total: number;
};

export async function* initializeRag(
  workspaceDataPath: string,
  clientRuntime: ClientRuntime,
  apiKey: string,
  onError?: (error: Error) => void,
): AsyncGenerator<RagUpdate> {
  // Detect orphaned embeddings and add them to the removal queue
  let orphanedEmbeddings: string[] = [];
  const _createManifest = async (relativePath: string) => {
    await createStoredFileManifest(
      workspaceDataPath,
      clientRuntime,
      relativePath,
    );
  };
  try {
    const table = await connectToDatabase(workspaceDataPath);
    const indexedPaths = await getAllIndexedFilePaths(table);
    await table.checkoutLatest();
    table.close();
    // Get all manifest keys from LevelDB
    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();
    const manifestPaths = new Set<string>();
    try {
      for await (const key of db.manifests.keys()) manifestPaths.add(key);
    } finally {
      await db.close();
    }

    // Find embeddings that don't have corresponding manifests (orphans)
    orphanedEmbeddings = [...indexedPaths].filter(
      (path) => !manifestPaths.has(path),
    );
  } catch (error) {
    // Don't fail the whole process if orphan detection fails
    onError?.(
      new Error(
        `Failed to detect orphaned embeddings: ${(error as Error).message}`,
      ),
    );
  }

  let { toAdd, toUpdate, toRemove } = await getRagFilesDiff(
    workspaceDataPath,
    clientRuntime,
    onError,
  );

  // Add orphaned embeddings to the removal queue
  if (orphanedEmbeddings.length > 0) {
    const orphanManifests = orphanedEmbeddings.map((path) => ({
      relativePath: path,
      contentHash: '',
      ragVersion: RAG_VERSION,
      indexedAt: 0,
    }));
    toRemove = [...toRemove, ...orphanManifests];
  }
  const total = toAdd.length + toUpdate.length + toRemove.length;
  let progress = 0;
  const filesToAdd = toAdd.map((file) => file.relativePath);
  const filesToUpdate = toUpdate.map((file) => file.relativePath);
  const filesToRemove = toRemove.map((file) => file.relativePath);

  // Process files to add - transactional: only save manifest if embedding succeeds
  const processedFiles = new Set<string>();
  let relativePathOfLastEmbedded: string | null = null;
  try {
    for await (const result of embedFiles(
      filesToAdd,
      clientRuntime,
      workspaceDataPath,
      apiKey,
    )) {
      if (!relativePathOfLastEmbedded)
        relativePathOfLastEmbedded = result.relativePath;

      // New file is being embedded
      if (!processedFiles.has(result.relativePath)) {
        processedFiles.add(result.relativePath);
        // Create manifest for the previous file which is fully embedded now
        await _createManifest(relativePathOfLastEmbedded);
        // Save this file to be the next one to save after being fully embedded
        relativePathOfLastEmbedded = result.relativePath;
        progress++;
        yield { progress, total };
      }
    }

    // Create manifest for the last file which was fully embedded
    if (relativePathOfLastEmbedded)
      await _createManifest(relativePathOfLastEmbedded);
  } catch (error) {
    onError?.(error as Error);
  }

  // Process files to update - delete old records first, then insert new ones
  processedFiles.clear();
  try {
    const table = await connectToDatabase(workspaceDataPath);
    let relativePathOfLastEmbedded: string | null = null;

    // Delete old records for all files we're about to update
    for (const filePath of filesToUpdate) {
      try {
        await deleteFileRecords(table, filePath);
      } catch (error) {
        onError?.(
          new Error(
            `Failed to delete old records for ${filePath}: ${(error as Error).message}`,
          ),
        );
      }
    }
    await table.checkoutLatest();
    table.close();

    // Now generate new embeddings (old ones are already deleted)
    for await (const result of embedFiles(
      filesToUpdate,
      clientRuntime,
      workspaceDataPath,
      apiKey,
    )) {
      if (!relativePathOfLastEmbedded)
        relativePathOfLastEmbedded = result.relativePath;

      // File is being updated
      if (!processedFiles.has(result.relativePath)) {
        processedFiles.add(result.relativePath);
        await _createManifest(relativePathOfLastEmbedded);
        // Save this file to be the next one to update after being fully embedded
        relativePathOfLastEmbedded = result.relativePath;
        progress++;
        yield { progress, total };
      }
    }

    // Create manifest for the last file which was fully embedded
    if (relativePathOfLastEmbedded)
      await _createManifest(relativePathOfLastEmbedded);
  } catch (error) {
    onError?.(error as Error);
  }

  // Process files to remove - transactional deletion
  try {
    const table = await connectToDatabase(workspaceDataPath);
    const successfullyDeleted: string[] = [];
    for (const filePath of filesToRemove) {
      try {
        await deleteFileRecords(table, filePath);
        successfullyDeleted.push(filePath);
        progress++;
        yield { progress, total };
      } catch (error) {
        onError?.(
          new Error(
            `Failed to delete embeddings for ${filePath}: ${(error as Error).message}`,
          ),
        );
      }
    }
    await table.checkoutLatest();
    table.close();

    // Batch delete manifests only for files where embeddings were successfully deleted (fast enough, batch deletion is fine)
    if (successfullyDeleted.length > 0) {
      const manifestResult = await deleteStoredFileManifestBatch(
        successfullyDeleted,
        workspaceDataPath,
      );
      for (const failure of manifestResult.failed) {
        onError?.(
          new Error(
            `Failed to delete manifest for ${failure.path}: ${failure.error.message}`,
          ),
        );
      }
    }
  } catch (error) {
    onError?.(error as Error);
  }
}

export async function queryRagWithoutRerank(
  query: string,
  workspaceDataPath: string,
  apiKey: string,
  limit = 10,
) {
  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_PROXY_URL || 'http://localhost:3002',
  });
  const embeddings = await generateEmbedding(
    openai,
    query,
    'gemini-embedding-001',
  );
  // generateEmbedding returns an array of embeddings, get the first one for the query
  const queryEmbedding = embeddings[0];
  if (!queryEmbedding) {
    throw new Error('Failed to generate embedding for query');
  }
  const table = await connectToDatabase(workspaceDataPath);
  const results = await searchSimilarFiles(table, queryEmbedding, limit);
  await table.checkoutLatest();
  table.close();
  return results.sort((a, b) => a._distance - b._distance);
}

async function* embedFiles(
  relativePaths: string[],
  clientRuntime: ClientRuntime,
  workspaceDataPath: string,
  apiKey: string,
): AsyncGenerator<FileEmbedding> {
  const table = await connectToDatabase(workspaceDataPath);
  try {
    const embeddings = generateFileEmbeddings(
      {
        apiKey,
        baseUrl: process.env.LLM_PROXY_URL || 'http://localhost:3002',
      },
      relativePaths,
      clientRuntime,
    );
    for await (const embedding of embeddings) {
      await addFileRecord(
        table,
        {
          absolutePath: clientRuntime.fileSystem.resolvePath(
            embedding.relativePath,
          ),
          relativePath: embedding.relativePath,
        },
        embedding,
      );
      yield embedding;
    }
  } finally {
    // Ensure all writes are flushed and visible before closing
    await table.checkoutLatest();
    table.close();
  }
}

/**
 * Gets the metadata for the RAG database
 * @param workspaceDataPath - The path to the workspace data
 * @returns The metadata object
 */
export async function getRagMetadata(workspaceDataPath: string) {
  const table = await connectToDatabase(workspaceDataPath);
  return await getRagMetadataFromDb(table);
}
