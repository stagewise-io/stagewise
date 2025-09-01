# @stagewise/agent-rag

RAG (Retrieval-Augmented Generation) package for the Stagewise agent, providing codebase indexing and semantic search capabilities.

## Features

- **Automatic Codebase Indexing**: Indexes all code files in your project
- **Semantic Search**: Find relevant files based on natural language queries
- **Incremental Updates**: Only re-indexes changed files
- **File Watching**: Automatically updates index when files change
- **Google Embeddings**: Uses Google's gemini-embedding-001 model

## Installation

```bash
pnpm add @stagewise/agent-rag
```

## Usage

### Basic Indexing

```typescript
import { indexCodebase } from '@stagewise/agent-rag';

// Index your codebase
for await (const progress of indexCodebase(apiKey)) {
  console.log(`${progress.type}: ${progress.message}`);
}
```

### Searching the Codebase

```typescript
import { searchCodebase } from '@stagewise/agent-rag';

// Search for relevant files
const results = await searchCodebase(
  apiKey,
  "authentication logic",
  { limit: 5 }
);

results.forEach(r => {
  console.log(`${r.relativePath} (relevance: ${1 - r.distance})`);
  console.log(r.content);
});
```

### Integration with Agent.ts

```typescript
import { searchCodebase } from '@stagewise/agent-rag';

// In your Agent class
private async retrieveContext(query: string) {
  const results = await searchCodebase(this.accessToken, query, {
    limit: 5,
    rootDir: process.cwd(),
    baseUrl: `${process.env.API_URL}/google`,
    headers: { 'stagewise-access-key': this.accessToken },
  });
  
  return results.map(r => ({
    path: r.relativePath,
    content: r.content,
    relevance: 1 - r.distance
  }));
}

// Use in callAgent method
const context = await this.retrieveContext(userMessage);
// Include context in prompt snippets
```

### File Watching

```typescript
import { createWatcher } from '@stagewise/agent-rag';

const watcher = createWatcher(apiKey, {}, (event) => {
  console.log(`File ${event.type}: ${event.file.relativePath}`);
});

// Later, stop watching
await watcher.stop();
```

## API Reference

### `indexCodebase(apiKey, options?)`
Indexes the codebase, yielding progress updates.

### `searchCodebase(apiKey, query, options?)`
Searches indexed files for semantic similarity to the query.

### `createWatcher(apiKey, options?, onFileChange?)`
Creates a file watcher that auto-updates the index.

### `cleanup()`
Cleans up all resources (database, watchers, etc).

## Configuration

All functions accept an options object with:
- `rootDir`: Root directory to index (default: `process.cwd()`)
- `baseUrl`: Custom API endpoint
- `headers`: Additional headers for API requests
- `dbPath`: Path to store the index database
- `limit`: Maximum number of results (for search only)