import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import OpenAI from 'openai';
import {
  type FileEmbedding,
  callEmbeddingApi,
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
  addFileRecordsBatch,
  createFileRecord,
  getAllIndexedFilePaths,
  searchSimilarFiles,
  getRagMetadata as getRagMetadataFromDb,
  type FileEmbeddingRecord,
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
  const db = LevelDb.getInstance(workspaceDataPath);
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
    await db.open();
    const manifestPaths = new Set<string>();
    for await (const key of db.manifests.keys()) manifestPaths.add(key);

    // Find embeddings that don't have corresponding manifests (orphans)
    orphanedEmbeddings = [...indexedPaths].filter(
      (path) => !manifestPaths.has(path),
    );
  } catch (error) {
    // Don't fail the whole process if orphan detection fails
    onError?.(new Error(`Failed to initialize RAG: ${error}`));
    throw error;
  } finally {
    await db.close();
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
    throw error;
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
        throw error;
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
    onError?.(new Error(`Failed to update embeddings: ${error}`));
    throw error;
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
        throw error;
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
    throw error;
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
  const embeddings = await callEmbeddingApi(
    openai,
    query,
    'gemini-embedding-001',
  );
  // generateEmbedding returns an array of embeddings, get the first one for the query
  const queryEmbedding = embeddings[0];
  if (!queryEmbedding)
    throw new Error('Failed to generate embedding for query');

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
  onError?: (error: Error) => void,
): AsyncGenerator<FileEmbedding> {
  const table = await connectToDatabase(workspaceDataPath);
  const BATCH_SIZE = 250; // Accumulate 250 records before writing to reduce fragment creation
  let recordBuffer: FileEmbeddingRecord[] = [];

  try {
    const embeddings = generateFileEmbeddings(
      {
        apiKey,
        baseUrl: process.env.LLM_PROXY_URL || 'http://localhost:3002',
      },
      relativePaths,
      clientRuntime,
      undefined, // onError
      10, // concurrency - use 10 parallel workers
    );

    for await (const embedding of embeddings) {
      // Create record and add to buffer
      const record = createFileRecord(
        {
          absolutePath: clientRuntime.fileSystem.resolvePath(
            embedding.relativePath,
          ),
          relativePath: embedding.relativePath,
        },
        embedding,
      );
      recordBuffer.push(record);

      // Batch write when buffer is full
      if (recordBuffer.length >= BATCH_SIZE) {
        await addFileRecordsBatch(table, recordBuffer);
        recordBuffer = [];
        // Checkout latest after batch write to see the new data
        await table.checkoutLatest();
      }

      yield embedding;
    }

    // Flush remaining records in buffer
    if (recordBuffer.length > 0) await addFileRecordsBatch(table, recordBuffer);
  } catch (error) {
    onError?.(new Error(`Failed to embed files: ${error}`));
    throw error;
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
