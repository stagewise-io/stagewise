import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises';

export interface EmbeddingConfig {
  apiKey: string;
  model?: string;
  batchSize?: number;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface FileEmbedding {
  filePath: string;
  content: string;
  embedding: number[];
}

export class EmbeddingGenerator {
  private genAI: GoogleGenAI;
  private model: string;
  private batchSize: number;

  constructor(config: EmbeddingConfig) {
    this.genAI = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { baseUrl: config.baseUrl, headers: config.headers },
    });
    this.model = config.model || 'gemini-embedding-001';
    this.batchSize = config.batchSize || 10;
  }

  private async readFileContent(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Truncate very long files to avoid token limits
      const maxLength = 30000; // ~7500 tokens
      if (content.length > maxLength) {
        return `${content.substring(0, maxLength)}\n... [truncated]`;
      }
      return content;
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      throw error;
    }
  }

  private chunkText(text: string, maxChunkSize = 8000): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        // If a single line is too long, split it
        if (line.length > maxChunkSize) {
          for (let i = 0; i < line.length; i += maxChunkSize) {
            chunks.push(line.substring(i, i + maxChunkSize));
          }
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.genAI.models.embedContent({
        model: `models/${this.model}`,
        contents: [text], // Wrap text in array as per API spec
      });
      return result.embeddings?.[0]?.values || [];
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async *generateFileEmbeddings(
    filePaths: string[],
  ): AsyncGenerator<FileEmbedding> {
    for (let i = 0; i < filePaths.length; i += this.batchSize) {
      const batch = filePaths.slice(i, i + this.batchSize);

      const embeddings = await Promise.allSettled(
        batch.map(async (filePath) => {
          const content = await this.readFileContent(filePath);
          const chunks = this.chunkText(content);

          // For now, we'll just use the first chunk
          // In a more sophisticated system, we might want to embed all chunks
          const firstChunk = chunks[0] || '';
          const embedding = await this.generateEmbedding(firstChunk);

          return {
            filePath,
            content: firstChunk, // Store the chunk we actually embedded
            embedding,
          };
        }),
      );

      for (const result of embeddings) {
        if (result.status === 'fulfilled') {
          yield result.value;
        } else {
          console.error('Failed to process file:', result.reason);
        }
      }

      // Add a small delay between batches to avoid rate limiting
      if (i + this.batchSize < filePaths.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  async generateSingleEmbedding(filePath: string): Promise<FileEmbedding> {
    const content = await this.readFileContent(filePath);
    const chunks = this.chunkText(content);
    const firstChunk = chunks[0] || '';
    const embedding = await this.generateEmbedding(firstChunk);

    return {
      filePath,
      content: firstChunk,
      embedding,
    };
  }
}
