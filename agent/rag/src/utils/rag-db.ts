import { connect, type Table } from '@lancedb/lancedb';
import { EXPECTED_EMBEDDING_DIM, RAG_VERSION } from '../index.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { FileEmbedding } from './embeddings.js';

export type FileInfo = {
  absolutePath: string;
  relativePath: string;
};

export interface FileEmbeddingRecord {
  absolute_path: string;
  relative_path: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  start_line: number;
  end_line: number;
  rag_version: number;
  indexed_at: number;
}

export interface DatabaseConfig {
  dbPath?: string;
  tableName?: string;
}

/**
 * Creates database configuration with defaults
 */
export function createDatabaseConfig(
  workspaceDataPath: string,
): Required<DatabaseConfig> {
  return {
    dbPath: path.join(workspaceDataPath, 'codebase-embeddings'),
    tableName: 'codebase_embeddings',
  };
}

/**
 * Ensures the database directory exists
 */
async function ensureDbDirectory(dbPath: string): Promise<void> {
  const dbDir = path.dirname(dbPath);
  try {
    await fs.access(dbDir);
  } catch {
    await fs.mkdir(dbDir, { recursive: true });
  }
}

async function ensureValidTable(workspaceDataPath: string): Promise<Table> {
  const fullConfig = createDatabaseConfig(workspaceDataPath);
  const connection = await connect({
    uri: fullConfig.dbPath,
    readConsistencyInterval: 0,
  });
  const initialRecord = createEmptyRecord();
  const tableNames = await connection.tableNames();
  if (tableNames.includes(fullConfig.tableName)) {
    const existingTable = await connection.openTable(fullConfig.tableName);
    const isValid = await validateTableSchema(existingTable);
    if (isValid) return existingTable;
    else {
      await connection.dropTable(fullConfig.tableName);
      return await connection.createTable(fullConfig.tableName, [
        initialRecord as any,
      ]);
    }
  } else {
    return await connection.createTable(fullConfig.tableName, [
      initialRecord as any,
    ]);
  }
}

/**
 * Connects to the database and optionally opens an existing table
 */
export async function connectToDatabase(
  workspaceDataPath: string,
): Promise<Table> {
  const fullConfig = createDatabaseConfig(workspaceDataPath);

  await ensureDbDirectory(fullConfig.dbPath);
  const table = await ensureValidTable(workspaceDataPath);
  await table.checkoutLatest();

  return table;
}

/**
 * Validates that the table schema matches expected embedding dimensions
 */
async function validateTableSchema(table: Table): Promise<boolean> {
  if (!table) return true; // No table, so no schema issues

  try {
    // Try to get the first record to check embedding dimensions
    const sample = (await table
      .query()
      .limit(1)
      .toArray()) as FileEmbeddingRecord[];
    if (sample.length === 0) return true; // Empty table, no schema issues

    // Check if the table is using the correct RAG version
    if (!('rag_version' in sample[0]!)) return false;
    const ragVersion = sample[0].rag_version as number;
    if (ragVersion !== RAG_VERSION) return false;

    // Check if the table is using the correct embedding dimensions
    if (!('embedding' in sample[0])) return false;
    const embeddingDim = sample[0].embedding?.length as number;
    if (embeddingDim !== EXPECTED_EMBEDDING_DIM) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an empty record with correct schema for table initialization
 */
function createEmptyRecord(): FileEmbeddingRecord {
  return {
    absolute_path: '',
    relative_path: '',
    content: '',
    embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0),
    chunk_index: 0,
    start_line: 0,
    end_line: 0,
    rag_version: RAG_VERSION,
    indexed_at: Date.now(),
  };
}

/**
 * Creates a file record from file info and embedding
 */
export function createFileRecord(
  fileInfo: FileInfo,
  embedding: FileEmbedding,
): FileEmbeddingRecord {
  return {
    chunk_index: embedding.chunkIndex,
    absolute_path: fileInfo.absolutePath,
    relative_path: fileInfo.relativePath,
    content: embedding.content,
    embedding: embedding.embedding,
    start_line: embedding.startLine,
    end_line: embedding.endLine,
    rag_version: RAG_VERSION,
    indexed_at: Date.now(),
  };
}

/**
 * Inserts a file record. Caller is responsible for deleting old records if needed.
 * For files with multiple chunks, this will be called once per chunk.
 */
export async function addFileRecord(
  table: Table,
  fileInfo: FileInfo,
  embedding: FileEmbedding,
): Promise<void> {
  if (!table) throw new Error('Table not initialized');

  const record = createFileRecord(fileInfo, embedding);
  await table.add([record as any]);
}

/**
 * Inserts multiple file records in a single batch operation.
 * This is much more efficient than calling addFileRecord() multiple times,
 * as it creates a single LanceDB fragment instead of one per record.
 */
export async function addFileRecordsBatch(
  table: Table,
  records: FileEmbeddingRecord[],
): Promise<void> {
  if (!table) throw new Error('Table not initialized');
  if (records.length === 0) return;

  await table.add(records as any);
}

/**
 * Deletes a file record by relative path
 */
export async function deleteFileRecords(
  table: Table,
  relativePath: string,
): Promise<void> {
  if (!table) {
    throw new Error('Table not initialized');
  }

  const predicate = `relative_path = '${relativePath}'`;

  // Checkout latest version twice to ensure we see all updates
  await table.delete(predicate);

  await table.checkoutLatest();
}

/**
 * Searches for similar files using vector similarity
 */
export async function searchSimilarFiles(
  table: Table,
  queryEmbedding: number[],
  limit = 10,
) {
  // Validate query embedding dimensions
  if (queryEmbedding.length !== EXPECTED_EMBEDDING_DIM) {
    throw new Error(
      `Query embedding has ${queryEmbedding.length} dimensions, ` +
        `but ${EXPECTED_EMBEDDING_DIM} dimensions are required.`,
    );
  }

  try {
    // Check if table is empty
    const count = await table.countRows();
    if (count === 0) {
      return [];
    }

    const results = (await table
      .search(queryEmbedding)
      .limit(limit)
      .toArray()) as (FileEmbeddingRecord & { _distance: number })[];

    return results;
  } catch (error: any) {
    // Schema mismatch detected during search. The table may need to be re-indexed. Please delete the .stagewise/index-db directory and re-run indexing.
    if (error.message?.includes('No vector column found'))
      throw new Error(
        'Database schema incompatible. Please re-index the codebase.',
      );

    throw error;
  }
}

/**
 * Gets all unique file paths currently indexed in the table
 * Used for detecting orphaned embeddings that don't have corresponding manifests
 */
export async function getAllIndexedFilePaths(
  table: Table,
): Promise<Set<string>> {
  try {
    // Check if table is empty
    const count = await table.countRows();
    if (count === 0) return new Set();

    // Query all records and collect unique relative paths
    const allRecords = await table.query().toArray();
    const uniquePaths = new Set<string>();

    // Skip empty records (used for schema initialization)
    for (const record of allRecords)
      if (record.relative_path && record.relative_path !== '')
        uniquePaths.add(record.relative_path);

    return uniquePaths;
  } catch (_error) {
    // If there's any error querying the table, return empty set
    // The caller will handle this gracefully
    return new Set();
  }
}

/**
 * Gets the metadata for the RAG database
 * @param table - The LanceDB table to get metadata from
 * @returns The metadata object
 */
export async function getRagMetadata(table: Table) {
  const allRecords = await table
    .query()
    .select(['indexed_at', 'relative_path', 'absolute_path']) // only fields you need
    .toArray();
  // Sort by indexed_at descending
  allRecords.sort((a, b) => b.indexed_at - a.indexed_at);

  const nonEmptyRecords = allRecords.filter(
    (record) => record.relative_path && record.relative_path !== '',
  );

  const seen = new Set<string>();
  const uniqueRecords = nonEmptyRecords.filter((record) => {
    if (seen.has(record.relative_path)) {
      return false;
    }
    seen.add(record.relative_path);
    return true;
  });
  const indexedFilesAmount = uniqueRecords.length;

  const newestEntry = nonEmptyRecords[0] as FileEmbeddingRecord | undefined;
  if (!newestEntry) return { lastIndexedAt: null, indexedFiles: 0 };
  return {
    lastIndexedAt: new Date(newestEntry.indexed_at),
    indexedFiles: indexedFilesAmount,
  };
}
