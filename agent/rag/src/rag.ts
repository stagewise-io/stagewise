import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import OpenAI from 'openai';
import {
  type FileEmbedding,
  generateEmbedding,
  generateFileEmbeddings,
} from './utils/embeddings.js';
import {
  createStoredFileManifest,
  deleteStoredFileManifest,
  getRagFilesDiff,
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
  const { toAdd, toUpdate, toRemove } = await getRagFilesDiff(
    workspaceDataPath,
    clientRuntime,
  );
  const total = toAdd.length + toUpdate.length + toRemove.length;
  let progress = 0;
  const filesToAdd = toAdd.map((file) => file.path);
  const filesToUpdate = toUpdate.map((file) => file.path);
  const filesToRemove = toRemove.map((file) => file.path);

  // Process files to add - batch processing with file-based progress tracking
  const processedFiles = new Set<string>();
  try {
    for await (const result of embedFiles(
      filesToAdd,
      clientRuntime,
      workspaceDataPath,
      apiKey,
    )) {
      await createStoredFileManifest(
        workspaceDataPath,
        clientRuntime,
        result.relativePath,
      );
      if (!processedFiles.has(result.relativePath)) {
        processedFiles.add(result.relativePath);
        progress++;
        yield { progress, total };
      }
    }
  } catch (error) {
    onError?.(error as Error);
  }

  // Process files to update - batch processing with file-based progress tracking
  processedFiles.clear();
  if (filesToUpdate.length > 0) {
    try {
      const dbConnection = await connectToDatabase(workspaceDataPath);
      await createOrUpdateTable(dbConnection, workspaceDataPath);
      const table = dbConnection.table;
      if (!table) throw new Error('Table not initialized');
      // Remove old records
      for (const filePath of filesToUpdate)
        await deleteFileRecords(table, filePath);

      for await (const result of embedFiles(
        filesToUpdate,
        clientRuntime,
        workspaceDataPath,
        apiKey,
      )) {
        await createStoredFileManifest(
          workspaceDataPath,
          clientRuntime,
          result.relativePath,
        );
        if (!processedFiles.has(result.relativePath)) {
          processedFiles.add(result.relativePath);
          progress++;
          yield { progress, total };
        }
      }
    } catch (error) {
      onError?.(error as Error);
    }
  }

  // Process files to remove - no embedding needed, just deletion
  if (filesToRemove.length > 0) {
    try {
      const dbConnection = await connectToDatabase(workspaceDataPath);
      await createOrUpdateTable(dbConnection, workspaceDataPath);
      const table = dbConnection.table;
      if (!table) throw new Error('Table not initialized');

      for (const filePath of filesToRemove) {
        await deleteFileRecords(table, filePath);
        await deleteStoredFileManifest(filePath, workspaceDataPath);
        progress++;
        yield { progress, total };
      }
    } catch (error) {
      onError?.(error as Error);
    }
  }

  // Update the RAG metadata
  let totalIndexedFiles = 0;
  try {
    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();
    for await (const _path of db.manifests.keys()) totalIndexedFiles++;

    const existingMetadata = await db.meta.get('schema');
    await db.meta.put('schema', {
      rag: {
        ragVersion: RAG_VERSION,
        lastIndexedAt: new Date(),
        indexedFiles: totalIndexedFiles,
      },
      schemaVersion: existingMetadata?.schemaVersion || LEVEL_DB_SCHEMA_VERSION,
      initializedAt:
        existingMetadata?.initializedAt || new Date().toISOString(),
    });
    await db.close();
  } catch (error) {
    onError?.(error as Error);
  }
}

export async function updateRag(
  relativePath: string,
  event: 'add' | 'update' | 'delete',
  clientRuntime: ClientRuntime,
  workspaceDataPath: string,
  apiKey: string,
) {
  const dbConnection = await connectToDatabase(workspaceDataPath);
  await createOrUpdateTable(dbConnection, workspaceDataPath);
  const table = dbConnection.table;
  if (!table) throw new Error('Table not initialized');

  switch (event) {
    case 'add': {
      for await (const _ of embedFiles(
        [relativePath],
        clientRuntime,
        workspaceDataPath,
        apiKey,
      )) {
      }
      await createStoredFileManifest(
        workspaceDataPath,
        clientRuntime,
        relativePath,
      );
      break;
    }
    case 'update': {
      await deleteStoredFileManifest(relativePath, workspaceDataPath);
      await deleteFileRecords(table, relativePath);
      for await (const _ of embedFiles(
        [relativePath],
        clientRuntime,
        workspaceDataPath,
        apiKey,
      )) {
      }
      await createStoredFileManifest(
        workspaceDataPath,
        clientRuntime,
        relativePath,
      );
      break;
    }
    case 'delete': {
      await deleteFileRecords(table, relativePath);
      await deleteStoredFileManifest(relativePath, workspaceDataPath);
      break;
    }
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
