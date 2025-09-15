import OpenAI from 'openai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { EXPECTED_EMBEDDING_DIM } from '../index.js';

export interface EmbeddingConfig {
  apiKey: string;
  model?: string;
  batchSize?: number;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface FileEmbedding {
  filePath: string;
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

/**
 * Chunks text into smaller pieces while preserving line boundaries
 */
export const chunkText = (
  text: string,
  maxChunkSize = 8000,
): { text: string; startLine: number; endLine: number }[] => {
  if (text.length <= maxChunkSize) {
    return [{ text, startLine: 0, endLine: text.length }];
  }

  const chunks: { text: string; startLine: number; endLine: number }[] = [];
  let currentChunk = '';
  const lines = text.split('\n');

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxChunkSize) {
      if (currentChunk) {
        chunks.push({
          text: currentChunk,
          startLine: 0,
          endLine: currentChunk.length,
        });
        currentChunk = '';
      }
      // If a single line is too long, split it
      if (line.length > maxChunkSize) {
        for (let i = 0; i < line.length; i += maxChunkSize) {
          chunks.push({
            text: line.substring(i, i + maxChunkSize),
            startLine: 0,
            endLine: line.length,
          });
        }
      } else {
        currentChunk = line;
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      startLine: 0,
      endLine: currentChunk.length,
    });
  }

  return chunks;
};

/**
 * Generates an embedding for the given text using the specified model
 */
export const generateEmbedding = async <T extends string | string[]>(
  client: OpenAI,
  text: T,
  model = 'gemini-embedding-001',
): Promise<number[][]> => {
  try {
    const result = await client.embeddings.create({
      // dimensions: EXPECTED_EMBEDDING_DIM,
      model: `${model}`,
      input: text, // Wrap text in array as per API spec
      encoding_format: 'float',
    });
    // Check if embedding has actual values or is all zeros
    const embedding = result.data?.map((d) => d.embedding || []) || [];

    if (embedding.some((e) => e.length !== EXPECTED_EMBEDDING_DIM)) {
      throw new Error(
        `Embedding has ${embedding.some((e) => e.length !== EXPECTED_EMBEDDING_DIM)} dimensions, but ${EXPECTED_EMBEDDING_DIM} dimensions are required.`,
      );
    }

    return embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw error;
  }
};

/**
 * Generates embeddings for multiple files in batches
 */
export async function* generateFileEmbeddings(
  config: EmbeddingConfig,
  filePaths: string[],
  clientRuntime: ClientRuntime,
): AsyncGenerator<FileEmbedding> {
  const client = createEmbeddingClient(config);
  const model = config.model || 'gemini-embedding-001';
  const batchSize = config.batchSize || 100;

  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);

    // First, read all files and chunk them
    const fileChunksData: Array<{
      filePath: string;
      chunks: Array<{ text: string; startLine: number; endLine: number }>;
    }> = [];

    for (const filePath of batch) {
      try {
        const content = await clientRuntime.fileSystem.readFile(filePath);
        if (!content.success) {
          console.error(`Failed to read file: ${filePath}`);
          continue;
        }
        const chunks = chunkText(content.content || '');
        fileChunksData.push({ filePath, chunks });
      } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
      }
    }

    // Prepare all chunks for batch embedding
    const chunkInfoList: Array<{
      filePath: string;
      chunkIndex: number;
      totalChunks: number;
      chunk: { text: string; startLine: number; endLine: number };
    }> = [];

    for (const { filePath, chunks } of fileChunksData) {
      chunks.forEach((chunk, index) => {
        chunkInfoList.push({
          filePath,
          chunkIndex: index,
          totalChunks: chunks.length,
          chunk,
        });
      });
    }

    // Process chunks in embedding batches
    const embeddingBatchSize = 100; // Max number of texts to embed at once
    for (let j = 0; j < chunkInfoList.length; j += embeddingBatchSize) {
      const chunkBatch = chunkInfoList.slice(j, j + embeddingBatchSize);
      const texts = chunkBatch.map((info) => info.chunk.text);

      try {
        // Batch embed all texts at once
        const embeddings = await generateEmbedding(client, texts, model);

        // Yield FileEmbedding for each chunk with its corresponding embedding
        for (let k = 0; k < chunkBatch.length; k++) {
          const info = chunkBatch[k];
          const embedding = embeddings[k];

          if (!info) {
            console.error(`Missing chunk info at index ${k}`);
            continue;
          }

          if (embedding && embedding.length === EXPECTED_EMBEDDING_DIM) {
            yield {
              filePath: info.filePath,
              relativePath: info.filePath,
              chunkIndex: info.chunkIndex,
              totalChunks: info.totalChunks,
              startLine: info.chunk.startLine,
              endLine: info.chunk.endLine,
              content: info.chunk.text,
              embedding: embedding,
            };
          } else {
            console.error(
              `Invalid embedding for ${info.filePath} chunk ${info.chunkIndex}`,
            );
          }
        }
      } catch (error) {
        console.error('Failed to generate embeddings for batch:', error);
      }

      // Add a small delay between embedding batches to avoid rate limiting
      if (j + embeddingBatchSize < chunkInfoList.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Add a small delay between file batches to avoid rate limiting
    if (i + batchSize < filePaths.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Generates an embedding for a single file
 */
export const generateSingleEmbedding = async (
  config: EmbeddingConfig,
  filePath: string,
  clientRuntime: ClientRuntime,
): Promise<FileEmbedding> => {
  const client = createEmbeddingClient(config);
  const model = config.model || 'gemini-embedding-001';

  const content = await clientRuntime.fileSystem.readFile(filePath);
  if (!content.success) throw new Error('Failed to read file');
  const chunks = chunkText(content.content || '');
  const firstChunk = chunks[0] || { text: '', startLine: 0, endLine: 0 };
  const embeddings = await generateEmbedding(client, firstChunk.text, model);

  // generateEmbedding returns an array of embeddings, get the first one
  const embedding = embeddings[0] || [];

  return {
    filePath,
    relativePath: filePath,
    chunkIndex: 0,
    totalChunks: chunks.length,
    startLine: firstChunk.startLine,
    endLine: firstChunk.endLine,
    content: firstChunk.text,
    embedding: embedding,
  };
};
