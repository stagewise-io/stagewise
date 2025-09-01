import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { indexCodebase, searchCodebase, cleanup } from '../src/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('Codebase Search', () => {
  const TEST_DIR = path.join(process.cwd(), 'test-codebase');
  const API_KEY = process.env.GOOGLE_API_KEY || 'test-key';

  beforeAll(async () => {
    // Create test directory and files
    await fs.mkdir(TEST_DIR, { recursive: true });
    
    // Create test files with distinct content
    await fs.writeFile(
      path.join(TEST_DIR, 'auth.ts'),
      `export function authenticate(username: string, password: string) {
        // Authentication logic here
        return validateCredentials(username, password);
      }`
    );
    
    await fs.writeFile(
      path.join(TEST_DIR, 'database.ts'),
      `import { connect } from 'database';
      export class DatabaseManager {
        async connect() {
          // Database connection logic
        }
      }`
    );
    
    await fs.writeFile(
      path.join(TEST_DIR, 'utils.ts'),
      `export function formatDate(date: Date): string {
        return date.toISOString();
      }
      export function parseJSON(str: string) {
        return JSON.parse(str);
      }`
    );

    // Index the test codebase
    for await (const progress of indexCodebase(API_KEY, {
      rootDir: TEST_DIR,
      dbPath: path.join(TEST_DIR, '.test-db'),
    })) {
      if (progress.type === 'error') {
        throw progress.error;
      }
    }
  });

  afterAll(async () => {
    // Cleanup
    await cleanup();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should find files related to authentication', async () => {
    const results = await searchCodebase(API_KEY, 'authentication password', {
      rootDir: TEST_DIR,
      dbPath: path.join(TEST_DIR, '.test-db'),
      limit: 3,
    });

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    
    // The auth.ts file should be the most relevant
    const authFile = results.find(r => r.relativePath.includes('auth.ts'));
    expect(authFile).toBeDefined();
  });

  it('should find files related to database', async () => {
    const results = await searchCodebase(API_KEY, 'database connection', {
      rootDir: TEST_DIR,
      dbPath: path.join(TEST_DIR, '.test-db'),
      limit: 2,
    });

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    
    // The database.ts file should be found
    const dbFile = results.find(r => r.relativePath.includes('database.ts'));
    expect(dbFile).toBeDefined();
  });

  it('should return results with expected properties', async () => {
    const results = await searchCodebase(API_KEY, 'format date', {
      rootDir: TEST_DIR,
      dbPath: path.join(TEST_DIR, '.test-db'),
      limit: 1,
    });

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    
    const result = results[0];
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('relativePath');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('distance');
    expect(result).toHaveProperty('extension');
    
    expect(typeof result.distance).toBe('number');
    expect(result.distance).toBeGreaterThanOrEqual(0);
  });

  it('should respect limit parameter', async () => {
    const results = await searchCodebase(API_KEY, 'export function', {
      rootDir: TEST_DIR,
      dbPath: path.join(TEST_DIR, '.test-db'),
      limit: 2,
    });

    expect(results).toBeDefined();
    expect(results.length).toBeLessThanOrEqual(2);
  });
});