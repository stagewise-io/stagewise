import OpenAI from 'openai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { generateFileEmbeddingsParallel } from './parallel-embeddings.js';
import { EXPECTED_EMBEDDING_DIM } from '../index.js';
import path from 'node:path';

export interface EmbeddingConfig {
  apiKey: string;
  model?: string;
  batchSize?: number;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface FileEmbedding {
  relativePath: string;
  chunkIndex: number;
  totalChunks: number;
  startLine: number;
  endLine: number;
  content: string;
  embedding: number[];
}

/**
 * Creates an OpenAI client with the provided configuration
 */
export const createEmbeddingClient = (config: EmbeddingConfig): OpenAI => {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.headers,
  });
};

export function getFileChunkContent(
  relativePath: string,
  _clientRuntime: ClientRuntime,
  content: string,
) {
  const description = (relativePath: string) => {
    const fileName = path.basename(relativePath);
    const extension = path.extname(relativePath);
    const defaultDescription = `A ${extension} file with the name ${fileName} from the file ${relativePath}.`;
    switch (extension) {
      case '.tsx':
      case '.jsx':
      case '.vue':
      case '.svelte':
      case '.astro':
      case '.html':
      case '.htm':
        return `FRONTEND FILE \n${defaultDescription}`;
      case '.css':
      case '.scss':
      case '.sass':
      case '.less':
      case '.styl':
        return `STYLING FILE \n${defaultDescription}`;
      case '.md':
      case '.mdx':
        return `DOCUMENTATION FILE \n${defaultDescription}`;
      default:
        return defaultDescription;
    }
  };
  const codeBlock = (code: string) => `\n\nCode:\n---\n${code}\n---`;
  return description(relativePath) + codeBlock(content);
}

/**
 * Chunks text into smaller pieces while preserving line boundaries
 */
export const getFileChunks = async (
  relativePath: string,
  clientRuntime: ClientRuntime,
  maxChunkSize = 8000,
): Promise<{ text: string; startLine: number; endLine: number }[]> => {
  const content = await clientRuntime.fileSystem.readFile(relativePath);
  if (!content.success) return [];
  const text = content.content || '';

  const lines = text.split('\n');

  // If the entire file fits in one chunk
  if (text.length <= maxChunkSize) {
    return [
      {
        text: getFileChunkContent(relativePath, clientRuntime, text),
        startLine: 1,
        endLine: lines.length,
      },
    ];
  }

  const chunks: { text: string; startLine: number; endLine: number }[] = [];
  let currentChunk = '';
  let chunkStartLine = 1;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line === undefined) continue; // Skip if line is undefined (should not happen)

    const lineNumber = lineIdx + 1; // 1-indexed line numbers

    // Check if adding this line would exceed max size
    if (currentChunk.length + line.length + 1 > maxChunkSize) {
      // Flush current chunk if it has content
      if (currentChunk) {
        chunks.push({
          text: getFileChunkContent(relativePath, clientRuntime, currentChunk),
          startLine: chunkStartLine,
          endLine: lineNumber - 1, // Previous line was the last one in this chunk
        });
        currentChunk = '';
        chunkStartLine = lineNumber; // New chunk starts at current line
      }

      // Handle extremely long single line (exceeds maxChunkSize by itself)
      if (line.length > maxChunkSize) {
        for (let i = 0; i < line.length; i += maxChunkSize) {
          chunks.push({
            text: getFileChunkContent(
              relativePath,
              clientRuntime,
              line.substring(i, i + maxChunkSize),
            ),
            startLine: lineNumber,
            endLine: lineNumber, // All segments are from the same line
          });
        }
        chunkStartLine = lineNumber + 1; // Next chunk starts after this line
      } else {
        // Start new chunk with this line
        currentChunk = line;
        // chunkStartLine is already correctly set to lineNumber
      }
    } else {
      // Add line to current chunk
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  // Flush any remaining chunk
  if (currentChunk) {
    chunks.push({
      text: getFileChunkContent(relativePath, clientRuntime, currentChunk),
      startLine: chunkStartLine,
      endLine: lines.length, // Last line of the file
    });
  }

  return chunks;
};

/**
 * Generates an embedding for the given text using the specified model
 */
export const callEmbeddingApi = async <T extends string | string[]>(
  client: OpenAI,
  text: T,
  model = 'gemini-embedding-001',
): Promise<number[][]> => {
  const result = await client.embeddings.create({
    model: `${model}`,
    input: text, // Wrap text in array as per API spec
    encoding_format: 'float',
  });
  const embedding = result.data?.map((d) => d.embedding || []) || [];

  if (embedding.some((e) => e.length !== EXPECTED_EMBEDDING_DIM)) {
    throw new Error(
      `Embedding has ${embedding.some((e) => e.length !== EXPECTED_EMBEDDING_DIM)} dimensions, but ${EXPECTED_EMBEDDING_DIM} dimensions are required.`,
    );
  }

  return embedding;
};

/**
 * Generates embeddings for multiple files in batches
 * @param config - Embedding configuration
 * @param relativePaths - Array of file paths to process
 * @param clientRuntime - Runtime for file system operations
 * @param onError - Optional error callback
 * @param concurrency - Number of parallel workers (default 1 for sequential processing)
 */
export async function* generateFileEmbeddings(
  config: EmbeddingConfig,
  relativePaths: string[],
  clientRuntime: ClientRuntime,
  onError?: (error: unknown) => void,
  concurrency?: number,
): AsyncGenerator<FileEmbedding> {
  // Use parallel implementation if concurrency > 1
  if (concurrency && concurrency > 1) {
    yield* generateFileEmbeddingsParallel(
      config,
      relativePaths,
      clientRuntime,
      concurrency,
      onError,
    );
    return;
  }

  // Sequential implementation (default)
  const client = createEmbeddingClient(config);
  const model = config.model || 'gemini-embedding-001';
  const batchSize = config.batchSize || 250;

  for (let i = 0; i < relativePaths.length; i += batchSize) {
    const batch = relativePaths.slice(i, i + batchSize);

    // First, read all files and chunk them
    const fileChunksData: Array<{
      relativePath: string;
      chunks: Array<{ text: string; startLine: number; endLine: number }>;
    }> = [];

    for (const relativePath of batch) {
      try {
        const content = await clientRuntime.fileSystem.readFile(relativePath);
        if (!content.success) continue;
        const allChunks = await getFileChunks(relativePath, clientRuntime);
        // Filter out empty or whitespace-only chunks
        const nonEmptyChunks = allChunks.filter(
          (chunk) => chunk.text.trim().length > 0,
        );
        fileChunksData.push({ relativePath, chunks: nonEmptyChunks });
      } catch (error) {
        onError?.(new Error(`Error processing file ${relativePath}: ${error}`));
        throw error;
      }
    }

    // Prepare all chunks for batch embedding
    const chunkInfoList: Array<{
      relativePath: string;
      chunkIndex: number;
      totalChunks: number;
      chunk: { text: string; startLine: number; endLine: number };
    }> = [];

    for (const { relativePath, chunks } of fileChunksData) {
      chunks.forEach((chunk, index) => {
        chunkInfoList.push({
          relativePath,
          chunkIndex: index,
          totalChunks: chunks.length,
          chunk,
        });
      });
    }

    // Process chunks in embedding batches
    const embeddingBatchSize = 250; // Max number of texts to embed at once

    // Skip embedding generation if there are no chunks to process
    if (chunkInfoList.length === 0) continue;

    for (let j = 0; j < chunkInfoList.length; j += embeddingBatchSize) {
      const chunkBatch = chunkInfoList.slice(j, j + embeddingBatchSize);
      const texts = chunkBatch.map((info) => info.chunk.text);

      // Batch embed all texts at once
      const embeddings = await callEmbeddingApi(client, texts, model);

      // Yield FileEmbedding for each chunk with its corresponding embedding
      for (let k = 0; k < chunkBatch.length; k++) {
        const info = chunkBatch[k];
        const embedding = embeddings[k];

        if (!info) {
          onError?.(new Error(`Missing chunk info at index ${k}`));
          continue;
        }

        if (embedding && embedding.length === EXPECTED_EMBEDDING_DIM) {
          yield {
            relativePath: info.relativePath,
            chunkIndex: info.chunkIndex,
            totalChunks: info.totalChunks,
            startLine: info.chunk.startLine,
            endLine: info.chunk.endLine,
            content: info.chunk.text,
            embedding: embedding,
          };
        } else {
          onError?.(
            new Error(
              `Invalid embedding for ${info.relativePath} chunk ${info.chunkIndex}`,
            ),
          );
        }
      }
    }
  }
}
