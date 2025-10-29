import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Table } from '@lancedb/lancedb';
import {
  connectToDatabase,
  createFileRecord,
  addFileRecord,
  deleteFileRecords,
  searchSimilarFiles,
  createDatabaseConfig,
  getRagMetadata,
  type FileInfo,
  type FileEmbeddingRecord,
} from './rag-db.js';
import { EXPECTED_EMBEDDING_DIM, RAG_VERSION } from '../index.js';
import type { FileEmbedding } from './embeddings.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('rag-db', () => {
  let testDbPath: string;
  let table: Table | null = null;

  beforeEach(async () => {
    // Use a unique test directory for each test
    testDbPath = `./test-db/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      // Small delay to ensure LanceDB has fully released file handles
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Clean up test directory
      await fs.rm(testDbPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up test database:', error);
      // Ignore cleanup errors
    }
  });

  describe('database connection and configuration', () => {
    it('should create database configuration with defaults', () => {
      const config = createDatabaseConfig(testDbPath);

      expect(config.dbPath).toBe(path.join(testDbPath, 'codebase-embeddings'));
      expect(config.tableName).toBe('codebase_embeddings');
    });

    it('should connect to database successfully', async () => {
      table = await connectToDatabase(testDbPath);

      expect(table).toBeDefined();
    });

    it('should create database directory if it does not exist', async () => {
      // Ensure the codebase-embeddings directory doesn't exist
      const dbDir = path.join(testDbPath, 'codebase-embeddings');
      try {
        await fs.access(dbDir);
        await fs.rm(dbDir, { recursive: true });
      } catch {
        // Directory doesn't exist, which is what we want
      }

      table = await connectToDatabase(testDbPath);

      // Check that the directory was created
      await expect(fs.access(dbDir)).resolves.not.toThrow();
    });
  });

  describe('file record operations', () => {
    beforeEach(async () => {
      table = await connectToDatabase(testDbPath);
    });

    it('should create file record with correct structure', () => {
      const fileInfo: FileInfo = {
        absolutePath: '/test/file.ts',
        relativePath: 'test/file.ts',
      };

      const embedding: FileEmbedding = {
        relativePath: 'test/file.ts',
        chunkIndex: 0,
        totalChunks: 1,
        startLine: 1,
        endLine: 10,
        content: 'test content',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
      };

      const record = createFileRecord(fileInfo, embedding);

      expect(record.absolute_path).toBe(fileInfo.absolutePath);
      expect(record.relative_path).toBe(fileInfo.relativePath);
      expect(record.content).toBe(embedding.content);
      expect(record.embedding).toHaveLength(EXPECTED_EMBEDDING_DIM);
      expect(record.rag_version).toBe(RAG_VERSION);
      expect(record.chunk_index).toBe(0);
    });

    it('should add file record (insert new)', async () => {
      const fileInfo: FileInfo = {
        absolutePath: '/test/new-file.ts',
        relativePath: 'test/new-file.ts',
      };

      const embedding: FileEmbedding = {
        relativePath: 'test/new-file.ts',
        chunkIndex: 0,
        totalChunks: 1,
        startLine: 1,
        endLine: 10,
        content: 'new file content',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.2),
      };

      await addFileRecord(table!, fileInfo, embedding);

      // Verify record was inserted by counting all non-empty records
      const allRecords = await table!.query().toArray();
      const nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );

      expect(nonEmptyRecords).toHaveLength(1);
      expect(nonEmptyRecords[0]?.content).toBe('new file content');
      expect(nonEmptyRecords[0]?.relative_path).toBe('test/new-file.ts');
    });

    it('should add multiple records for the same file', async () => {
      const fileInfo: FileInfo = {
        absolutePath: '/test/multi-chunk.ts',
        relativePath: 'test/multi-chunk.ts',
      };

      // Add multiple chunks for the same file
      for (let i = 0; i < 3; i++) {
        const embedding: FileEmbedding = {
          relativePath: 'test/multi-chunk.ts',
          chunkIndex: i,
          totalChunks: 3,
          startLine: i * 10 + 1,
          endLine: (i + 1) * 10,
          content: `chunk ${i} content`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1 * (i + 1)),
        };

        await addFileRecord(table!, fileInfo, embedding);
      }

      // Verify all chunks were added
      const allRecords = await table!.query().toArray();
      const nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );

      expect(nonEmptyRecords).toHaveLength(3);

      // Verify each chunk exists
      for (let i = 0; i < 3; i++) {
        const chunkRecords = nonEmptyRecords.filter(
          (r) => r.content === `chunk ${i} content`,
        );
        expect(chunkRecords).toHaveLength(1);
        expect(chunkRecords[0]?.chunk_index).toBe(i);
      }
    });

    it('should delete file records by file path', async () => {
      const fileInfo: FileInfo = {
        absolutePath: '/test/to-delete.ts',
        relativePath: 'test/to-delete.ts',
      };

      const embedding: FileEmbedding = {
        relativePath: 'test/to-delete.ts',
        chunkIndex: 0,
        totalChunks: 1,
        startLine: 1,
        endLine: 10,
        content: 'content to delete',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.5),
      };

      // Insert record
      await addFileRecord(table!, fileInfo, embedding);

      // Verify record exists
      let allRecords = (await table!
        .query()
        .toArray()) as FileEmbeddingRecord[];
      let nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyRecords).toHaveLength(1);

      // Delete record
      await deleteFileRecords(table!, fileInfo.relativePath);

      // Verify deletion operation completed
      await table?.checkoutLatest();
      allRecords = await table!.query().toArray();
      nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      // After deletion, there should be no non-empty records
      expect(nonEmptyRecords.length).toBe(0);
    });

    it('should handle special characters in file paths', async () => {
      const fileInfo: FileInfo = {
        absolutePath: '/test/file with spaces & symbols!@#.ts',
        relativePath: 'test/file with spaces & symbols!@#.ts',
      };

      const embedding: FileEmbedding = {
        relativePath: 'test/file with spaces & symbols!@#.ts',
        chunkIndex: 0,
        totalChunks: 1,
        startLine: 1,
        endLine: 10,
        content: 'test content with special chars',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
      };

      await expect(
        addFileRecord(table!, fileInfo, embedding),
      ).resolves.not.toThrow();

      // Verify the record was inserted
      const allRecords = await table!.query().toArray();
      const nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );

      expect(nonEmptyRecords).toHaveLength(1);
      expect(nonEmptyRecords[0]?.content).toBe(
        'test content with special chars',
      );
    });

    it('should handle very large embedding vectors', async () => {
      const fileInfo: FileInfo = {
        absolutePath: '/test/large-embedding.ts',
        relativePath: 'test/large-embedding.ts',
      };

      // Create embedding with extreme values
      const largeEmbedding = new Array(EXPECTED_EMBEDDING_DIM)
        .fill(0)
        .map((_, i) => (i % 2 === 0 ? 1000 : -1000));

      const embedding: FileEmbedding = {
        relativePath: 'test/large-embedding.ts',
        chunkIndex: 0,
        totalChunks: 1,
        startLine: 1,
        endLine: 10,
        content: 'content with large embedding values',
        embedding: largeEmbedding,
      };

      await expect(
        addFileRecord(table!, fileInfo, embedding),
      ).resolves.not.toThrow();

      // Verify record was inserted
      const allRecords = await table!.query().toArray();
      const nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyRecords).toHaveLength(1);
      expect(nonEmptyRecords[0]?.content).toBe(
        'content with large embedding values',
      );
    });
  });

  describe('vector similarity search', () => {
    beforeEach(async () => {
      table = await connectToDatabase(testDbPath);
    });

    it('should return empty results for empty table', async () => {
      const queryEmbedding = new Array(EXPECTED_EMBEDDING_DIM).fill(0.5);

      const results = await searchSimilarFiles(table!, queryEmbedding, 5);

      // Filter out empty records that may persist from table creation
      const nonEmptyResults = results.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyResults).toHaveLength(0);
    });

    it('should find similar files based on vector similarity', async () => {
      // Add test records with different embeddings
      const testRecords: FileEmbeddingRecord[] = [
        {
          absolute_path: '/test/similar1.ts',
          relative_path: 'test/similar1.ts',
          content: 'similar content 1',
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.8), // High similarity
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: Date.now(),
        },
        {
          absolute_path: '/test/similar2.ts',
          relative_path: 'test/similar2.ts',
          content: 'similar content 2',
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.7), // Medium similarity
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: Date.now(),
        },
        {
          absolute_path: '/test/different.ts',
          relative_path: 'test/different.ts',
          content: 'very different content',
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1), // Low similarity
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: Date.now(),
        },
      ];

      // Insert all test records
      await table!.add(testRecords as any);

      // Search with query similar to the high similarity record
      const queryEmbedding = new Array(EXPECTED_EMBEDDING_DIM).fill(0.75);

      const results = await searchSimilarFiles(table!, queryEmbedding, 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // Results should include distance information
      for (const result of results) {
        expect(result._distance).toBeDefined();
        expect(typeof result._distance).toBe('number');
        expect(result.absolute_path).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.embedding).toHaveLength(EXPECTED_EMBEDDING_DIM);
      }

      // Results should be ordered by similarity (lower distance = more similar)
      for (let i = 1; i < results.length; i++) {
        expect(results[i]?._distance).toBeGreaterThanOrEqual(
          results[i - 1]?._distance ?? 0,
        );
      }
    });

    it('should respect the limit parameter', async () => {
      // Add multiple test records
      for (let i = 0; i < 10; i++) {
        const record = {
          absolute_path: `/test/file${i}.ts`,
          relative_path: `test/file${i}.ts`,
          content: `content ${i}`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1 * i),
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
        };
        await table!.add([record as any]);
      }

      const queryEmbedding = new Array(EXPECTED_EMBEDDING_DIM).fill(0.5);

      // Test different limits
      const results3 = await searchSimilarFiles(table!, queryEmbedding, 3);
      // Filter out empty records
      const nonEmptyResults3 = results3.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyResults3).toHaveLength(3);

      const results5 = await searchSimilarFiles(table!, queryEmbedding, 5);
      const nonEmptyResults5 = results5.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyResults5).toHaveLength(5);

      const results15 = await searchSimilarFiles(table!, queryEmbedding, 15);
      // Filter out empty records and check count
      const nonEmptyResults15 = results15.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyResults15).toHaveLength(10); // Limited by actual record count
    });

    it('should throw error for wrong embedding dimensions', async () => {
      const wrongDimEmbedding = new Array(512).fill(0.5); // Wrong dimension

      await expect(
        searchSimilarFiles(table!, wrongDimEmbedding, 5),
      ).rejects.toThrow(/dimensions are required/);
    });
  });

  describe('error handling and edge cases', () => {
    beforeEach(async () => {
      table = await connectToDatabase(testDbPath);
    });

    it('should handle empty file paths in delete operations', async () => {
      await expect(deleteFileRecords(table!, '')).resolves.not.toThrow();
    });
  });

  describe('concurrency and performance', () => {
    beforeEach(async () => {
      table = await connectToDatabase(testDbPath);
    });

    it('should handle concurrent add operations', async () => {
      const concurrentPromises = [];

      // Create multiple concurrent add operations
      for (let i = 0; i < 10; i++) {
        const fileInfo: FileInfo = {
          absolutePath: `/test/concurrent-${i}.ts`,
          relativePath: `test/concurrent-${i}.ts`,
        };

        const embedding: FileEmbedding = {
          relativePath: `test/concurrent-${i}.ts`,
          chunkIndex: 0,
          totalChunks: 1,
          startLine: 1,
          endLine: 10,
          content: `concurrent content ${i}`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1 * i),
        };

        concurrentPromises.push(addFileRecord(table!, fileInfo, embedding));
      }

      // All operations should complete successfully
      await expect(Promise.all(concurrentPromises)).resolves.not.toThrow();

      // Verify all records were inserted (excluding empty record)
      const allRecords = await table!.query().toArray();
      const nonEmptyRecords = allRecords.filter(
        (r) => r.absolute_path !== '' && r.content !== '',
      );
      expect(nonEmptyRecords).toHaveLength(10);
    });

    it('should handle concurrent search operations', async () => {
      // First, add some test data
      for (let i = 0; i < 20; i++) {
        const record: FileEmbeddingRecord = {
          absolute_path: `/test/search-${i}.ts`,
          relative_path: `test/search-${i}.ts`,
          content: `search content ${i}`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1 * i),
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: Date.now(),
        };
        await table!.add([record as any]);
      }

      // Perform concurrent searches
      const searchPromises = [];
      for (let i = 0; i < 5; i++) {
        const queryEmbedding = new Array(EXPECTED_EMBEDDING_DIM).fill(
          0.1 * i + 0.5,
        );
        searchPromises.push(searchSimilarFiles(table!, queryEmbedding, 5));
      }

      const results = await Promise.all(searchPromises);

      // All searches should return results
      expect(results).toHaveLength(5);
      for (const result of results) {
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('getRagMetadata', () => {
    beforeEach(async () => {
      table = await connectToDatabase(testDbPath);
    });

    it('should return null lastIndexedAt and 0 indexedFiles for empty table', async () => {
      const metadata = await getRagMetadata(table!);

      expect(metadata.lastIndexedAt).toBeNull();
      expect(metadata.indexedFiles).toBe(0);
    });

    it('should return correct metadata for single file with single chunk', async () => {
      const now = Date.now();
      const record: FileEmbeddingRecord = {
        absolute_path: '/test/file1.ts',
        relative_path: 'test/file1.ts',
        content: 'test content',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
        chunk_index: 0,
        start_line: 1,
        end_line: 10,
        rag_version: RAG_VERSION,
        indexed_at: now,
      };

      await table!.add([record as any]);

      const metadata = await getRagMetadata(table!);

      expect(metadata.indexedFiles).toBe(1);
      expect(metadata.lastIndexedAt).toBeInstanceOf(Date);
      expect(metadata.lastIndexedAt?.getTime()).toBe(now);
    });

    it('should return correct count for multiple files with single chunk each', async () => {
      const baseTime = Date.now();
      const records: FileEmbeddingRecord[] = [];

      for (let i = 0; i < 5; i++) {
        records.push({
          absolute_path: `/test/file${i}.ts`,
          relative_path: `test/file${i}.ts`,
          content: `content ${i}`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1 * i),
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: baseTime + i * 1000, // Different timestamps
        });
      }

      await table!.add(records as any);

      const metadata = await getRagMetadata(table!);

      expect(metadata.indexedFiles).toBe(5);
      // Should return the newest timestamp
      expect(metadata.lastIndexedAt?.getTime()).toBe(baseTime + 4 * 1000);
    });

    it('should count file with multiple chunks as single file', async () => {
      const now = Date.now();
      const records: FileEmbeddingRecord[] = [];

      // Add 3 chunks for the same file
      for (let i = 0; i < 3; i++) {
        records.push({
          absolute_path: '/test/multi-chunk.ts',
          relative_path: 'test/multi-chunk.ts',
          content: `chunk ${i} content`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1 * (i + 1)),
          chunk_index: i,
          start_line: i * 10 + 1,
          end_line: (i + 1) * 10,
          rag_version: RAG_VERSION,
          indexed_at: now + i * 100, // Slightly different timestamps
        });
      }

      await table!.add(records as any);

      const metadata = await getRagMetadata(table!);

      // Should count as 1 file despite 3 chunks
      expect(metadata.indexedFiles).toBe(1);
      // Should return the newest timestamp from the chunks
      expect(metadata.lastIndexedAt?.getTime()).toBe(now + 2 * 100);
    });

    it('should handle multiple files with multiple chunks correctly', async () => {
      const baseTime = Date.now();
      const records: FileEmbeddingRecord[] = [];

      // File 1: 2 chunks
      for (let i = 0; i < 2; i++) {
        records.push({
          absolute_path: '/test/file1.ts',
          relative_path: 'test/file1.ts',
          content: `file1 chunk ${i}`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
          chunk_index: i,
          start_line: i * 10 + 1,
          end_line: (i + 1) * 10,
          rag_version: RAG_VERSION,
          indexed_at: baseTime,
        });
      }

      // File 2: 3 chunks
      for (let i = 0; i < 3; i++) {
        records.push({
          absolute_path: '/test/file2.ts',
          relative_path: 'test/file2.ts',
          content: `file2 chunk ${i}`,
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.2),
          chunk_index: i,
          start_line: i * 10 + 1,
          end_line: (i + 1) * 10,
          rag_version: RAG_VERSION,
          indexed_at: baseTime + 5000,
        });
      }

      // File 3: 1 chunk
      records.push({
        absolute_path: '/test/file3.ts',
        relative_path: 'test/file3.ts',
        content: 'file3 content',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.3),
        chunk_index: 0,
        start_line: 1,
        end_line: 10,
        rag_version: RAG_VERSION,
        indexed_at: baseTime + 10000, // This is the newest
      });

      await table!.add(records as any);

      const metadata = await getRagMetadata(table!);

      // Should count 3 unique files (not 6 total chunks)
      expect(metadata.indexedFiles).toBe(3);
      // Should return the newest timestamp across all files
      expect(metadata.lastIndexedAt?.getTime()).toBe(baseTime + 10000);
    });

    it('should return newest timestamp across files with varying indexed_at values', async () => {
      const oldTime = Date.now() - 100000;
      const newTime = Date.now();

      const records: FileEmbeddingRecord[] = [
        {
          absolute_path: '/test/old-file.ts',
          relative_path: 'test/old-file.ts',
          content: 'old content',
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: oldTime,
        },
        {
          absolute_path: '/test/new-file.ts',
          relative_path: 'test/new-file.ts',
          content: 'new content',
          embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.2),
          chunk_index: 0,
          start_line: 1,
          end_line: 10,
          rag_version: RAG_VERSION,
          indexed_at: newTime,
        },
      ];

      await table!.add(records as any);

      const metadata = await getRagMetadata(table!);

      expect(metadata.indexedFiles).toBe(2);
      // Should return the newer timestamp
      expect(metadata.lastIndexedAt?.getTime()).toBe(newTime);
    });

    it('should filter out empty initialization records', async () => {
      const now = Date.now();

      // Add actual file record
      const record: FileEmbeddingRecord = {
        absolute_path: '/test/file1.ts',
        relative_path: 'test/file1.ts',
        content: 'test content',
        embedding: new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
        chunk_index: 0,
        start_line: 1,
        end_line: 10,
        rag_version: RAG_VERSION,
        indexed_at: now,
      };

      await table!.add([record as any]);

      const metadata = await getRagMetadata(table!);

      // Should count only the non-empty record, not the initialization record
      expect(metadata.indexedFiles).toBe(1);
      expect(metadata.lastIndexedAt?.getTime()).toBe(now);
    });
  });
});
