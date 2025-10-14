import { Level } from 'level';
import type { AbstractSublevel } from 'abstract-level';
import type { FileManifest } from './manifests.js';
import type { RouteMapping } from '../search-agents/search-routes.js';
import type { StyleInformation } from '../search-agents/search-styles.js';
import type { ComponentLibraryInformation } from '../search-agents/search-components.js';
import type { AppInformation } from '../search-agents/search-app-information.js';
import { LEVEL_DB_SCHEMA_VERSION, RAG_VERSION } from '../index.js';
import type { InspirationComponent } from '@stagewise/agent-tools';
import path from 'node:path';

// Singleton cache for LevelDb instances
const dbInstances = new Map<string, LevelDb>();

// Mutex to prevent concurrent schema checks/resets
const schemaMutex = new Map<string, Promise<void>>();

interface DatabaseMetadata {
  rag: {
    ragVersion: number;
    lastIndexedAt: Date | null;
    indexedFiles: number;
  };
  schemaVersion: number;
  initializedAt: string;
}

function getDatabasePath(workspaceDataPath: string): string {
  return path.join(workspaceDataPath, 'typed-db');
}

// Auto-opening wrapper for sublevels
async function ensureOpen(db: Level): Promise<void> {
  if (db.status === 'closed' || db.status === 'opening') await db.open();
}

export class LevelDb {
  private dbPath!: string;
  private db: Level | null = null;
  private isOpen = false;

  // Sublevel properties
  public manifests!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    FileManifest
  >;
  public routing!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    RouteMapping
  >;
  public style!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    StyleInformation
  >;
  public component!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    ComponentLibraryInformation
  >;
  public app!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    AppInformation
  >;
  public meta!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    DatabaseMetadata
  >;
  public inspirationComponent!: AbstractSublevel<
    Level,
    string | Buffer | Uint8Array,
    string,
    InspirationComponent
  >;

  private constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  // Static factory method for getting instances
  public static getInstance(workspaceDataPath: string): LevelDb {
    const dbPath = getDatabasePath(workspaceDataPath);

    if (dbInstances.has(dbPath)) return dbInstances.get(dbPath)!;

    const instance = new LevelDb(dbPath);
    dbInstances.set(dbPath, instance);
    return instance;
  }

  private initializeSublevels(): void {
    if (!this.db)
      throw new Error('Database must be opened before accessing sublevels');

    this.manifests = this.db.sublevel<string, FileManifest>('manifests', {
      valueEncoding: 'json',
    });
    this.routing = this.db.sublevel<string, RouteMapping>('routing', {
      valueEncoding: 'json',
    });
    this.style = this.db.sublevel<string, StyleInformation>('style', {
      valueEncoding: 'json',
    });
    this.component = this.db.sublevel<string, ComponentLibraryInformation>(
      'component',
      {
        valueEncoding: 'json',
      },
    );
    this.app = this.db.sublevel<string, AppInformation>('app', {
      valueEncoding: 'json',
    });
    this.meta = this.db.sublevel<string, DatabaseMetadata>('meta', {
      valueEncoding: 'json',
    });
    this.inspirationComponent = this.db.sublevel<string, InspirationComponent>(
      'inspirationComponent',
      {
        valueEncoding: 'json',
      },
    );
  }

  public async open(newSchemaVersion = LEVEL_DB_SCHEMA_VERSION): Promise<void> {
    // If already open, just return
    if (this.isOpen && this.db) return;

    // Use mutex to prevent concurrent schema checks
    if (schemaMutex.has(this.dbPath)) {
      await schemaMutex.get(this.dbPath);
      return;
    }

    const schemaCheckPromise = (async () => {
      try {
        // Create and open the Level instance
        if (!this.db) {
          this.db = new Level(this.dbPath, {
            valueEncoding: 'json',
            createIfMissing: true,
            errorIfExists: false,
          });
        }

        await ensureOpen(this.db);
        this.initializeSublevels();

        await this.checkSchemaVersion(newSchemaVersion);
        this.isOpen = true;
      } finally {
        schemaMutex.delete(this.dbPath);
      }
    })();

    schemaMutex.set(this.dbPath, schemaCheckPromise);
    await schemaCheckPromise;
  }

  public async close(): Promise<void> {
    if (this.db && this.isOpen) {
      if (this.db.status === 'open') {
        await this.db.close();
      }
      this.isOpen = false;

      // Remove from cache to release all references
      dbInstances.delete(this.dbPath);

      // Clear any pending schema check mutex for this path
      schemaMutex.delete(this.dbPath);

      this.db = null;
    }
  }

  private async checkSchemaVersion(newSchemaVersion: number): Promise<void> {
    if (!this.db || !this.meta) {
      throw new Error(
        'Database and sublevels must be initialized before checking schema version',
      );
    }

    try {
      const metadata = await this.meta.get('schema');

      if (!metadata || metadata.schemaVersion !== newSchemaVersion)
        await this.resetDatabase(newSchemaVersion);
    } catch (_) {
      // If we can't read the schema version, treat as uninitialized
      try {
        await this.resetDatabase(newSchemaVersion);
      } catch (_) {
        throw new Error('Failed to reset corrupted database');
      }
    }
  }

  private async resetDatabase(
    newSchemaVersion: number = LEVEL_DB_SCHEMA_VERSION,
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database must be initialized before resetting');
    }

    try {
      // Clear all data from the database
      await this.db.clear();

      // Initialize metadata with current schema version
      const metadata: DatabaseMetadata = {
        rag: {
          ragVersion: RAG_VERSION,
          lastIndexedAt: null,
          indexedFiles: 0,
        },
        schemaVersion: newSchemaVersion,
        initializedAt: new Date().toISOString(),
      };

      await this.meta.put('schema', metadata);
    } catch (_) {
      throw new Error('Failed to reset database');
    }
  }
}
