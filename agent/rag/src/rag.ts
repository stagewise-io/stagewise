import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import OpenAI from 'openai';
import {
  type FileEmbedding,
  generateEmbedding,
  generateFileEmbeddings,
} from './utils/embeddings.js';
import {
  getRagFilesDiff,
  createStoredFileManifestBatch,
  deleteStoredFileManifestBatch,
} from './utils/manifests.js';
import {
  connectToDatabase,
  createOrUpdateTable,
  deleteFileRecords,
  searchSimilarFiles,
  upsertFileRecord,
} from './utils/rag-db.js';
import { LEVEL_DB_SCHEMA_VERSION, LevelDb, RAG_VERSION } from './index.js';

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
  // Clean up any orphaned manifests from previous failed runs BEFORE starting

  const { toAdd, toUpdate, toRemove } = await getRagFilesDiff(
    workspaceDataPath,
    clientRuntime,
    onError,
  );
  const total = toAdd.length + toUpdate.length + toRemove.length;
  let progress = 0;
  const filesToAdd = toAdd.map((file) => file.relativePath);
  const filesToUpdate = toUpdate.map((file) => file.relativePath);
  const filesToRemove = toRemove.map((file) => file.relativePath);

  // Process files to add - transactional: only save manifest if embedding succeeds
  const processedFiles = new Set<string>();
  const successfullyEmbedded: string[] = [];
  try {
    for await (const result of embedFiles(
      filesToAdd,
      clientRuntime,
      workspaceDataPath,
      apiKey,
    )) {
      successfullyEmbedded.push(result.relativePath);
      if (!processedFiles.has(result.relativePath)) {
        processedFiles.add(result.relativePath);
        progress++;
        yield { progress, total };
      }
    }

    // Batch save manifests for all successfully embedded files
    if (successfullyEmbedded.length > 0) {
      const manifestResult = await createStoredFileManifestBatch(
        workspaceDataPath,
        clientRuntime,
        successfullyEmbedded,
      );
      // Log any manifest save failures but don't stop the process
      for (const failure of manifestResult.failed) {
        onError?.(
          new Error(
            `Failed to save manifest for ${failure.path}: ${failure.error.message}`,
          ),
        );
      }
    }
  } catch (error) {
    onError?.(error as Error);
  }

  // Process files to update - delete old records first, then insert new ones
  processedFiles.clear();
  successfullyEmbedded.length = 0;
  if (filesToUpdate.length > 0) {
    try {
      const dbConnection = await connectToDatabase(workspaceDataPath);
      await createOrUpdateTable(dbConnection, workspaceDataPath, (error) =>
        onError?.(new Error(`Failed to update table: ${error}`)),
      );
      const table = dbConnection.table;
      if (!table) throw new Error('Table not initialized');

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

      // Now generate new embeddings (old ones are already deleted)
      for await (const result of embedFiles(
        filesToUpdate,
        clientRuntime,
        workspaceDataPath,
        apiKey,
      )) {
        successfullyEmbedded.push(result.relativePath);
        if (!processedFiles.has(result.relativePath)) {
          processedFiles.add(result.relativePath);
          progress++;
          yield { progress, total };
        }
      }

      // Batch update manifests for all successfully embedded files
      if (successfullyEmbedded.length > 0) {
        const manifestResult = await createStoredFileManifestBatch(
          workspaceDataPath,
          clientRuntime,
          successfullyEmbedded,
        );
        for (const failure of manifestResult.failed) {
          onError?.(
            new Error(
              `Failed to update manifest for ${failure.path}: ${failure.error.message}`,
            ),
          );
        }
      }
    } catch (error) {
      onError?.(error as Error);
    }
  }

  // Process files to remove - transactional deletion
  if (filesToRemove.length > 0) {
    try {
      const dbConnection = await connectToDatabase(workspaceDataPath);
      await createOrUpdateTable(dbConnection, workspaceDataPath);
      const table = dbConnection.table;
      if (!table) throw new Error('Table not initialized');

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

      // Batch delete manifests only for files where embeddings were successfully deleted
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

  // Update the RAG metadata with accurate file count
  let totalIndexedFiles = 0;
  try {
    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();
    try {
      for await (const _path of db.manifests.keys()) totalIndexedFiles++;

      const existingMetadata = await db.meta.get('schema');
      await db.meta.put('schema', {
        rag: {
          ragVersion: RAG_VERSION,
          lastIndexedAt: new Date(),
          indexedFiles: totalIndexedFiles,
        },
        schemaVersion:
          existingMetadata?.schemaVersion || LEVEL_DB_SCHEMA_VERSION,
        initializedAt:
          existingMetadata?.initializedAt || new Date().toISOString(),
      });
    } finally {
      await db.close();
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
  const dbConnection = await connectToDatabase(workspaceDataPath);
  await createOrUpdateTable(dbConnection, workspaceDataPath);
  const table = dbConnection.table;
  if (!table) throw new Error('Table not initialized');
  const results = await searchSimilarFiles(table, queryEmbedding, limit);
  return results.sort((a, b) => a.distance - b.distance);
}

async function* embedFiles(
  relativePaths: string[],
  clientRuntime: ClientRuntime,
  workspaceDataPath: string,
  apiKey: string,
): AsyncGenerator<FileEmbedding> {
  const dbConnection = await connectToDatabase(workspaceDataPath);
  const { table } = await createOrUpdateTable(dbConnection, workspaceDataPath);
  if (!table) throw new Error('Table not initialized');
  const embeddings = generateFileEmbeddings(
    {
      apiKey,
      baseUrl: process.env.LLM_PROXY_URL || 'http://localhost:3002',
    },
    relativePaths,
    clientRuntime,
  );
  for await (const embedding of embeddings) {
    await upsertFileRecord(
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
}
