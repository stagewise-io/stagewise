import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { EXPECTED_EMBEDDING_DIM, RAG_VERSION } from '../index.js';
import { LevelDb } from '../index.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { FileEmbedding } from './embeddings.js';

export type FileInfo = {
  absolutePath: string;
  relativePath: string;
};

export interface FileEmbeddingRecord {
  filePath: string;
  relativePath: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  startLine: number;
  endLine: number;
  ragVersion: number;
}

export interface DatabaseConfig {
  dbPath?: string;
  tableName?: string;
}

export interface DatabaseConnection {
  connection: Connection;
  table: Table | null;
  config: Required<DatabaseConfig>;
}

export interface TableStats {
  totalFiles: number;
  totalSize: number;
  lastUpdated: Date | null;
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

/**
 * Connects to the database and optionally opens an existing table
 */
export async function connectToDatabase(
  workspaceDataPath: string,
): Promise<DatabaseConnection> {
  const fullConfig = createDatabaseConfig(workspaceDataPath);

  await ensureDbDirectory(fullConfig.dbPath);
  const connection = await connect(fullConfig.dbPath);

  // Check if table exists
  const tables = await connection.tableNames();
  let table = null;

  if (tables.includes(fullConfig.tableName)) {
    table = await connection.openTable(fullConfig.tableName);
  }

  return {
    connection,
    table,
    config: fullConfig,
  };
}

/**
 * Validates that the table schema matches expected embedding dimensions
 */
async function validateTableSchema(
  table: Table | null,
  workspaceDataPath: string,
): Promise<boolean> {
  if (!table) return true; // No table, so no schema issues

  try {
    // Try to get the first record to check embedding dimensions
    const sample = await table.query().limit(1).toArray();
    if (sample.length === 0) return true; // Empty table, no schema issues

    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();

    const metadata = await db.meta.get('schema');
    // Schema mismatch detected: Table has a deprecated version. Re-indexing needed.
    if (metadata!.rag.ragVersion !== RAG_VERSION) return false;

    const embeddingDim = sample[0].embedding?.length;
    // Schema mismatch detected: Table has 0-dimensional embeddings, but 128 dimensions are required. Re-indexing needed.
    if (embeddingDim !== EXPECTED_EMBEDDING_DIM) return false;

    return true;
  } catch {
    return false; // Assume schema is invalid if we can't check
  }
}

/**
 * Creates an empty record with correct schema for table initialization
 */
function createEmptyRecord(): FileEmbeddingRecord {
  return {
    filePath: '',
    relativePath: '',
    content: '',
    embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0),
    chunkIndex: 0,
    startLine: 0,
    endLine: 0,
    ragVersion: RAG_VERSION,
  };
}

/**
 * Creates or updates a table, handling schema validation and recreation if needed
 */
export async function createOrUpdateTable(
  dbConnection: DatabaseConnection,
  workspaceDataPath: string,
): Promise<DatabaseConnection> {
  const { connection, config } = dbConnection;
  const tables = await connection.tableNames();

  if (!tables.includes(config.tableName)) {
    // Create table with initial schema if provided
    const emptyRecord = createEmptyRecord();
    const table = await connection.createTable(config.tableName, [
      emptyRecord as any,
    ]);
    // Clear the empty record
    await table.delete('"filePath" = ""');

    return { ...dbConnection, table };
  } else {
    // Table exists, open it and validate schema
    let table = await connection.openTable(config.tableName);

    // Check if schema is valid
    const isValid = await validateTableSchema(table, workspaceDataPath);
    if (!isValid) {
      // Drop the existing table
      await connection.dropTable(config.tableName);

      // Recreate with correct schema
      const emptyRecord = createEmptyRecord();
      table = await connection.createTable(config.tableName, [
        emptyRecord as any,
      ]);
      // Clear the empty record
      await table.delete('"filePath" = ""');
    }

    return { ...dbConnection, table };
  }
}

/**
 * Gets a file record by file path
 */
const getFileRecords = async (
  table: Table,
  filePath: string,
): Promise<FileEmbeddingRecord[] | null> => {
  if (!table) {
    throw new Error('Table not initialized');
  }

  try {
    const results = await table
      .query()
      .where(`"filePath" = "${filePath}"`)
      .toArray();

    return results;
  } catch {
    return null;
  }
};

/**
 * Creates a file record from file info and embedding
 */
export function createFileRecord(
  fileInfo: FileInfo,
  embedding: FileEmbedding,
): FileEmbeddingRecord {
  return {
    chunkIndex: embedding.chunkIndex,
    filePath: fileInfo.absolutePath,
    relativePath: fileInfo.relativePath,
    content: embedding.content,
    embedding: embedding.embedding,
    startLine: 0,
    endLine: 0,
    ragVersion: RAG_VERSION,
  };
}

/**
 * Upserts a file record (insert or update)
 */
export async function upsertFileRecord(
  table: Table,
  fileInfo: FileInfo,
  embedding: FileEmbedding,
): Promise<void> {
  if (!table) {
    throw new Error('Table not initialized');
  }

  const record = createFileRecord(fileInfo, embedding);

  // Check if record exists
  const existing = await getFileRecords(table, fileInfo.absolutePath);

  if (existing && existing.length > 0)
    await deleteFileRecords(table, fileInfo.absolutePath);

  // Insert new record
  await table.add([record as any]);
}

/**
 * Deletes a file record by file path
 */
export async function deleteFileRecords(
  table: Table,
  filePath: string,
): Promise<void> {
  if (!table) {
    throw new Error('Table not initialized');
  }

  await table.delete(`"filePath" = "${filePath}"`);
}

/**
 * Searches for similar files using vector similarity
 */
export async function searchSimilarFiles(
  table: Table,
  queryEmbedding: number[],
  limit = 10,
): Promise<Array<FileEmbeddingRecord & { distance: number }>> {
  if (!table) {
    throw new Error(
      'Table not initialized. Please ensure the codebase is indexed first.',
    );
  }

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

    return results.map((r) => ({
      filePath: r.filePath,
      relativePath: r.relativePath,
      content: r.content,
      embedding: r.embedding,
      chunkIndex: r.chunkIndex,
      startLine: r.startLine,
      endLine: r.endLine,
      distance: r._distance,
      ragVersion: r.ragVersion,
    }));
  } catch (error: any) {
    // Schema mismatch detected during search. The table may need to be re-indexed. Please delete the .stagewise/index-db directory and re-run indexing.
    if (error.message?.includes('No vector column found'))
      throw new Error(
        'Database schema incompatible. Please re-index the codebase.',
      );

    throw error;
  }
}
