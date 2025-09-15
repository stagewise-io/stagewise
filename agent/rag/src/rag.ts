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
} from './utils/database.js';

export type RagUpdate = {
  progress: number;
  total: number;
};

export async function* initializeRag(
  clientRuntime: ClientRuntime,
  apiKey: string,
): AsyncGenerator<RagUpdate> {
  const { toAdd, toUpdate, toRemove } = await getRagFilesDiff(clientRuntime);
  const total = toAdd.length + toUpdate.length + toRemove.length;
  let progress = 0;
  const filesToAdd = toAdd.map((file) => file.path);
  const filesToUpdate = toUpdate.map((file) => file.path);
  const filesToRemove = toRemove.map((file) => file.path);
  for await (const result of embedFiles(filesToAdd, clientRuntime, apiKey)) {
    await createStoredFileManifest(clientRuntime, result.relativePath);
    yield { progress: progress + 1, total };
    progress++;
  }
  for await (const result of embedFiles(filesToUpdate, clientRuntime, apiKey)) {
    await createStoredFileManifest(clientRuntime, result.relativePath);
    yield { progress: progress + 1, total };
    progress++;
  }
  for await (const result of embedFiles(filesToRemove, clientRuntime, apiKey)) {
    await deleteStoredFileManifest(result.relativePath, clientRuntime);
    yield { progress: progress + 1, total };
    progress++;
  }
}

export async function updateRag(
  relativePath: string,
  event: 'add' | 'update' | 'delete',
  clientRuntime: ClientRuntime,
  apiKey: string,
) {
  const dbConnection = await connectToDatabase(
    clientRuntime.fileSystem.getCurrentWorkingDirectory() || '',
  );
  await createOrUpdateTable(dbConnection);
  const table = dbConnection.table;
  if (!table) throw new Error('Table not initialized');

  switch (event) {
    case 'add': {
      for await (const _ of embedFiles([relativePath], clientRuntime, apiKey)) {
      }
      await createStoredFileManifest(clientRuntime, relativePath);
      break;
    }
    case 'update': {
      await deleteStoredFileManifest(relativePath, clientRuntime);
      await deleteFileRecords(table, relativePath);
      for await (const _ of embedFiles([relativePath], clientRuntime, apiKey)) {
      }
      await createStoredFileManifest(clientRuntime, relativePath);
      break;
    }
    case 'delete': {
      await deleteFileRecords(table, relativePath);
      await deleteStoredFileManifest(relativePath, clientRuntime);
      break;
    }
  }
}

export async function queryRag(
  query: string,
  clientRuntime: ClientRuntime,
  apiKey: string,
  limit = 10,
) {
  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_PROXY_URL || 'https://llm.stagewise.io',
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
  const dbConnection = await connectToDatabase(
    clientRuntime.fileSystem.getCurrentWorkingDirectory() || '',
  );
  await createOrUpdateTable(dbConnection);
  const table = dbConnection.table;
  if (!table) throw new Error('Table not initialized');
  const results = await searchSimilarFiles(table, queryEmbedding, limit);
  return results.sort((a, b) => a.distance - b.distance);
}

async function* embedFiles(
  relativePaths: string[],
  clientRuntime: ClientRuntime,
  apiKey: string,
): AsyncGenerator<FileEmbedding> {
  const dbConnection = await connectToDatabase(
    clientRuntime.fileSystem.getCurrentWorkingDirectory() || '',
  );
  const { table } = await createOrUpdateTable(dbConnection);
  if (!table) throw new Error('Table not initialized');
  const embeddings = generateFileEmbeddings(
    {
      apiKey,
      baseUrl: process.env.LLM_PROXY_URL || 'https://llm.stagewise.io',
    },
    relativePaths,
    clientRuntime,
  );
  for await (const embedding of embeddings) {
    yield embedding;
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
  }
}
