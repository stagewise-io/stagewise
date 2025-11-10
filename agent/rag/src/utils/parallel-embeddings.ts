import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { EXPECTED_EMBEDDING_DIM } from '../index.js';
import {
  type EmbeddingConfig,
  type FileEmbedding,
  createEmbeddingClient,
  callEmbeddingApi,
  getFileChunks,
} from './embeddings.js';

interface ChunkWithMetadata {
  fileIndex: number;
  relativePath: string;
  chunkIndex: number;
  totalChunksInFile: number;
  text: string;
  startLine: number;
  endLine: number;
}

interface WorkItem {
  batchId: number;
  chunks: ChunkWithMetadata[];
}

interface EmbeddingResult {
  fileIndex: number;
  relativePath: string;
  embeddings: FileEmbedding[];
}

/**
 * Generates embeddings for multiple files using parallel workers
 * Workers pull from a shared queue and process files concurrently
 * Results are yielded in original file order to maintain sequential processing for manifests
 */
export async function* generateFileEmbeddingsParallel(
  config: EmbeddingConfig,
  relativePaths: string[],
  clientRuntime: ClientRuntime,
  concurrency = 10,
  onLogError?: (error: unknown) => void,
): AsyncGenerator<FileEmbedding> {
  if (relativePaths.length === 0) return;

  // Phase 1: Read and chunk ALL files, then aggregate chunks
  // Step 1: Read all files and collect chunks with metadata
  const allFileData: Array<{
    fileIndex: number;
    relativePath: string;
    chunks: Array<{ text: string; startLine: number; endLine: number }>;
  }> = [];

  for (let i = 0; i < relativePaths.length; i++) {
    const relativePath = relativePaths[i];
    if (!relativePath) continue;

    try {
      const content = await clientRuntime.fileSystem.readFile(relativePath);
      if (!content.success) continue;

      const allChunks = await getFileChunks(relativePath, clientRuntime);
      const nonEmptyChunks = allChunks.filter(
        (chunk) => chunk.text.trim().length > 0,
      );

      if (nonEmptyChunks.length > 0) {
        allFileData.push({
          fileIndex: i,
          relativePath,
          chunks: nonEmptyChunks,
        });
      }
    } catch (error) {
      onLogError?.(new Error(`Error chunking file ${relativePath}: ${error}`));
      throw error;
    }
  }

  if (allFileData.length === 0) return;

  // Step 2: Flatten all chunks with file metadata
  const flattenedChunks: ChunkWithMetadata[] = [];

  for (const fileData of allFileData) {
    fileData.chunks.forEach((chunk, chunkIndex) => {
      flattenedChunks.push({
        fileIndex: fileData.fileIndex,
        relativePath: fileData.relativePath,
        chunkIndex,
        totalChunksInFile: fileData.chunks.length,
        text: chunk.text,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      });
    });
  }

  // Step 3: Create work items with 250 chunks each
  const embeddingBatchSize = 250;
  const workItems: WorkItem[] = [];

  for (let i = 0; i < flattenedChunks.length; i += embeddingBatchSize) {
    workItems.push({
      batchId: Math.floor(i / embeddingBatchSize),
      chunks: flattenedChunks.slice(i, i + embeddingBatchSize),
    });
  }

  // Phase 2: Create work queue and result storage
  const workQueue = [...workItems];
  const resultMap = new Map<number, EmbeddingResult>();
  let completedCount = 0;
  let nextFileToYield = 0;
  const totalFiles = allFileData.length;

  // Phase 3: Worker function
  const worker = async (workerId: number) => {
    const client = createEmbeddingClient(config);
    const model = config.model || 'gemini-embedding-001';

    while (workQueue.length > 0) {
      const item = workQueue.shift();
      if (!item) break;

      try {
        // Each work item already contains up to 250 chunks
        const texts = item.chunks.map((c) => c.text);

        const embeddingVectors = await callEmbeddingApi(client, texts, model);

        // Store results grouped by file
        for (let j = 0; j < item.chunks.length; j++) {
          const chunk = item.chunks[j];
          const embedding = embeddingVectors[j];

          if (!chunk) {
            onLogError?.(
              new Error(`Missing chunk at index ${j} in batch ${item.batchId}`),
            );
            throw new Error(
              `Missing chunk at index ${j} in batch ${item.batchId}`,
            );
          }

          if (embedding && embedding.length === EXPECTED_EMBEDDING_DIM) {
            // Get or create result entry for this file
            let fileResult = resultMap.get(chunk.fileIndex);
            if (!fileResult) {
              fileResult = {
                fileIndex: chunk.fileIndex,
                relativePath: chunk.relativePath,
                embeddings: [],
              };
              resultMap.set(chunk.fileIndex, fileResult);
            }

            fileResult.embeddings.push({
              relativePath: chunk.relativePath,
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunksInFile,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              content: chunk.text,
              embedding: embedding,
            });
          } else {
            onLogError?.(
              new Error(
                `Invalid embedding for ${chunk.relativePath} chunk ${chunk.chunkIndex}`,
              ),
            );
            throw new Error(
              `Invalid embedding for ${chunk.relativePath} chunk ${chunk.chunkIndex}`,
            );
          }
        }

        completedCount++;
      } catch (error) {
        onLogError?.(
          new Error(
            `Worker ${workerId} error for batch ${item.batchId}: ${error}`,
          ),
        );
        // Still increment completed count to avoid hanging
        completedCount++;
        throw error;
      }
    }
  };

  // Phase 4: Start all workers
  const workers = Array.from(
    { length: Math.min(concurrency, workItems.length) },
    (_, i) => worker(i + 1),
  );
  const workerPromise = Promise.all(workers);

  // Track worker errors to prevent unhandled rejections
  let workerError: Error | null = null;
  workerPromise.catch((error) => {
    workerError = error as Error;
  });

  // Phase 5: Yield results in original file order
  while (nextFileToYield < totalFiles) {
    // Check for worker errors and fail fast
    if (workerError) throw workerError;

    // Wait for next file's result to be available
    while (!resultMap.has(nextFileToYield)) {
      // Check if all workers are done but we still don't have this result
      // This means the file failed to process or has no chunks
      if (completedCount >= workItems.length) {
        nextFileToYield++;
        break;
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const result = resultMap.get(nextFileToYield);
    if (result) {
      // Sort embeddings by chunk index to ensure correct order
      result.embeddings.sort((a, b) => a.chunkIndex - b.chunkIndex);

      // Yield all embeddings for this file
      for (const embedding of result.embeddings) yield embedding;

      resultMap.delete(nextFileToYield); // Free memory
      nextFileToYield++;
    }
  }

  // Final check for worker errors after loop completes
  if (workerError) throw workerError;

  // Ensure all workers complete
  await workerPromise;
}
