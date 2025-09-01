import { connect, type Connection } from '@lancedb/lancedb';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { FileInfo } from './file-scanner.js';
import type { FileEmbedding } from './embeddings.js';

export interface FileRecord {
  id: string;
  filePath: string;
  relativePath: string;
  content: string;
  embedding: number[];
  lastModified: number; // Unix timestamp in milliseconds
  fileSize: number;
  extension: string;
}

export interface DatabaseConfig {
  dbPath?: string;
  tableName?: string;
}

export class DatabaseManager {
  private dbPath: string;
  private tableName: string;
  private connection: Connection | null = null;
  private table: any | null = null;
  private readonly EXPECTED_EMBEDDING_DIM = 3072; // gemini-embedding-001 dimension

  constructor(config: DatabaseConfig = {}) {
    this.dbPath =
      config.dbPath || path.join(process.cwd(), '.stagewise', 'index-db');
    this.tableName = config.tableName || 'codebase_embeddings';
  }

  private async ensureDbDirectory(): Promise<void> {
    const dbDir = path.dirname(this.dbPath);
    try {
      await fs.access(dbDir);
    } catch {
      await fs.mkdir(dbDir, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    await this.ensureDbDirectory();
    this.connection = await connect(this.dbPath);

    // Check if table exists
    const tables = await this.connection.tableNames();
    if (tables.includes(this.tableName)) {
      this.table = await this.connection.openTable(this.tableName);
    }
  }

  private async validateTableSchema(): Promise<boolean> {
    if (!this.table) {
      return true; // No table, so no schema issues
    }

    try {
      // Try to get the first record to check embedding dimensions
      const sample = await this.table.query().limit(1).toArray();
      if (sample.length === 0) {
        return true; // Empty table, no schema issues
      }

      const embeddingDim = sample[0].embedding?.length;
      if (embeddingDim !== this.EXPECTED_EMBEDDING_DIM) {
        console.log(
          `Schema mismatch detected: Table has ${embeddingDim}-dimensional embeddings, ` +
            `but ${this.EXPECTED_EMBEDDING_DIM} dimensions are required. Re-indexing needed.`,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to validate table schema:', error);
      return false; // Assume schema is invalid if we can't check
    }
  }

  async createOrUpdateTable(schema?: FileRecord): Promise<void> {
    if (!this.connection) {
      throw new Error('Database not connected');
    }

    const tables = await this.connection.tableNames();

    if (!tables.includes(this.tableName)) {
      // Create table with initial schema if provided
      if (schema) {
        this.table = await this.connection.createTable(this.tableName, [
          schema as any,
        ]);
      } else {
        // Create empty table with schema
        // Use a dummy embedding with correct dimensions for schema inference
        const emptyRecord: FileRecord = {
          id: '',
          filePath: '',
          relativePath: '',
          content: '',
          embedding: new Array(this.EXPECTED_EMBEDDING_DIM).fill(0),
          lastModified: Date.now(),
          fileSize: 0,
          extension: '',
        };
        this.table = await this.connection.createTable(this.tableName, [
          emptyRecord as any,
        ]);
        // Clear the empty record
        await this.table.delete('id = ""');
      }
    } else {
      // Table exists, open it and validate schema
      this.table = await this.connection.openTable(this.tableName);

      // Check if schema is valid
      const isValid = await this.validateTableSchema();
      if (!isValid) {
        console.log('Dropping table with incompatible schema...');
        // Drop the existing table
        await this.connection.dropTable(this.tableName);

        // Recreate with correct schema
        const emptyRecord: FileRecord = {
          id: '',
          filePath: '',
          relativePath: '',
          content: '',
          embedding: new Array(this.EXPECTED_EMBEDDING_DIM).fill(0),
          lastModified: Date.now(),
          fileSize: 0,
          extension: '',
        };
        this.table = await this.connection.createTable(this.tableName, [
          emptyRecord as any,
        ]);
        // Clear the empty record
        await this.table.delete('id = ""');

        console.log(
          'Table recreated with correct schema. Full re-indexing will occur on next run.',
        );
      }
    }
  }

  async getFileRecord(filePath: string): Promise<FileRecord | null> {
    if (!this.table) {
      throw new Error('Table not initialized');
    }

    try {
      const results = await this.table
        .query()
        .where(`filePath = "${filePath}"`)
        .limit(1)
        .toArray();

      return results.length > 0 ? results[0] : null;
    } catch {
      return null;
    }
  }

  async getChangedFiles(files: FileInfo[]): Promise<FileInfo[]> {
    if (!this.table) {
      // If table doesn't exist, all files are new
      return files;
    }

    const changedFiles: FileInfo[] = [];

    for (const file of files) {
      const record = await this.getFileRecord(file.absolutePath);

      if (!record || record.lastModified < file.modifiedTime.getTime()) {
        changedFiles.push(file);
      }
    }

    return changedFiles;
  }

  async upsertFileRecord(
    fileInfo: FileInfo,
    embedding: FileEmbedding,
  ): Promise<void> {
    if (!this.table) {
      throw new Error('Table not initialized');
    }

    const record: FileRecord = {
      id: Buffer.from(fileInfo.absolutePath).toString('base64'),
      filePath: fileInfo.absolutePath,
      relativePath: fileInfo.relativePath,
      content: embedding.content,
      embedding: embedding.embedding,
      lastModified: fileInfo.modifiedTime.getTime(), // Convert Date to timestamp
      fileSize: fileInfo.size,
      extension: fileInfo.extension,
    };

    // Check if record exists
    const existing = await this.getFileRecord(fileInfo.absolutePath);

    if (existing) {
      // Update existing record
      await this.table.update({
        where: `filePath = "${fileInfo.absolutePath}"`,
        values: record,
      });
    } else {
      // Insert new record
      await this.table.add([record]);
    }
  }

  async deleteFileRecord(filePath: string): Promise<void> {
    if (!this.table) {
      throw new Error('Table not initialized');
    }

    await this.table.delete(`filePath = "${filePath}"`);
  }

  async getIndexedFilePaths(): Promise<Set<string>> {
    if (!this.table) {
      return new Set();
    }

    try {
      const results = await this.table.query().select(['filePath']).toArray();

      return new Set(results.map((r: any) => r.filePath));
    } catch {
      return new Set();
    }
  }

  async getTableStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    lastUpdated: Date | null;
  }> {
    if (!this.table) {
      return {
        totalFiles: 0,
        totalSize: 0,
        lastUpdated: null,
      };
    }

    try {
      const results = await this.table.query().toArray();

      const stats = {
        totalFiles: results.length,
        totalSize: results.reduce((sum: number, r: any) => sum + r.fileSize, 0),
        lastUpdated:
          results.length > 0
            ? new Date(
                results.reduce(
                  (latest: number, r: any) =>
                    r.lastModified > latest ? r.lastModified : latest,
                  results[0].lastModified,
                ),
              )
            : null,
      };

      return stats;
    } catch {
      return {
        totalFiles: 0,
        totalSize: 0,
        lastUpdated: null,
      };
    }
  }

  async searchSimilarFiles(
    queryEmbedding: number[],
    limit = 10,
  ): Promise<Array<FileRecord & { distance: number }>> {
    if (!this.table) {
      throw new Error(
        'Table not initialized. Please ensure the codebase is indexed first.',
      );
    }

    // Validate query embedding dimensions
    if (queryEmbedding.length !== this.EXPECTED_EMBEDDING_DIM) {
      throw new Error(
        `Query embedding has ${queryEmbedding.length} dimensions, ` +
          `but ${this.EXPECTED_EMBEDDING_DIM} dimensions are required.`,
      );
    }

    try {
      // Check if table is empty
      const count = await this.table.countRows();
      if (count === 0) {
        console.log('No indexed files found. Please run indexing first.');
        return [];
      }

      const results = await this.table
        .search(queryEmbedding)
        .limit(limit)
        .toArray();

      return results.map((r: any) => ({
        id: r.id,
        filePath: r.filePath,
        relativePath: r.relativePath,
        content: r.content,
        embedding: r.embedding,
        lastModified: r.lastModified,
        fileSize: r.fileSize,
        extension: r.extension,
        distance: r._distance,
      }));
    } catch (error: any) {
      // Provide more helpful error messages
      if (error.message?.includes('No vector column found')) {
        console.error(
          'Schema mismatch detected during search. The table may need to be re-indexed. ' +
            'Please delete the .stagewise/index-db directory and re-run indexing.',
        );
        throw new Error(
          'Database schema incompatible. Please re-index the codebase.',
        );
      }
      console.error('Failed to search similar files:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // LanceDB doesn't require explicit connection closing
    this.connection = null;
    this.table = null;
  }
}
