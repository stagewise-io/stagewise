import { BINARY_DETECTION } from '../shared.js';
import type {
  BaseFileSystemProvider,
  GrepMatch,
  GrepResult,
  GrepOptions,
} from '@stagewise/agent-runtime-interface';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';

export async function grepNodeFallback(
  fileSystem: BaseFileSystemProvider,
  pattern: string,
  options?: GrepOptions,
): Promise<GrepResult> {
  // Fallback to Node.js implementation if ripgrep is unavailable or failed
  try {
    const regex = new RegExp(pattern, options?.caseSensitive ? 'g' : 'gi');
    const matches: GrepMatch[] = [];
    let filesSearched = 0;
    let totalOutputSize = 0;
    const MAX_OUTPUT_SIZE = 1 * 1024 * 1024; // 1MB limit for total output
    // Use absoluteSearchPath if provided, otherwise use current working directory
    const basePath =
      options?.absoluteSearchPath ?? fileSystem.getCurrentWorkingDirectory();

    const searchFile = async (filePath: string) => {
      if (options?.maxMatches && matches.length >= options.maxMatches) return;

      // Check if we've exceeded the output size limit before reading the file
      if (totalOutputSize >= MAX_OUTPUT_SIZE) return;

      try {
        // Check for binary files unless explicitly told to search them
        // Read a small buffer to check for NUL bytes (following ripgrep's approach)
        const stats = await fs.stat(filePath);
        const bytesToRead = Math.min(
          stats.size,
          BINARY_DETECTION.CHECK_BUFFER_SIZE,
        );

        if (bytesToRead > 0) {
          const fileHandle = await fs.open(filePath, 'r');
          try {
            const buffer = Buffer.alloc(bytesToRead);
            await fileHandle.read(buffer, 0, bytesToRead, 0);
            // Check for NUL bytes (0x00) which indicate binary content
            if (buffer.includes(0x00)) return;
          } finally {
            await fileHandle.close();
          }
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        filesSearched++;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          let match: RegExpExecArray | null = null;
          regex.lastIndex = 0; // Reset regex state

          while (true) {
            match = regex.exec(line);
            if (!match) break;
            if (options?.maxMatches && matches.length >= options.maxMatches)
              return;

            // Extract context: 5 lines before and 5 lines after the match
            const contextBefore = 5;
            const contextAfter = 5;
            const startLine = Math.max(0, i - contextBefore);
            const endLine = Math.min(lines.length - 1, i + contextAfter);
            const contextLines = lines.slice(startLine, endLine + 1);
            const preview = contextLines.join('\n');

            // Note: We don't truncate preview length here to preserve full context
            // The total output size is still limited by MAX_OUTPUT_SIZE check below

            const matchEntry: GrepMatch = {
              relativePath: path.relative(basePath, filePath),
              absolutePath: filePath,
              line: i + 1,
              column: match.index + 1,
              match: match[0],
              preview,
            };

            // Estimate the size of this match entry when serialized
            const estimatedSize = JSON.stringify(matchEntry).length;

            // Check if adding this match would exceed the output size limit
            // Stop collecting matches if we're about to exceed the size limit
            if (totalOutputSize + estimatedSize > MAX_OUTPUT_SIZE) return;

            matches.push(matchEntry);
            totalOutputSize += estimatedSize;
          }
        }
      } catch (_error) {
        // Skip files that can't be read (binary files, etc.)
      }
    };

    const searchDirectory = async (dirPath: string, depth: number) => {
      if (options?.maxDepth !== undefined && depth > options.maxDepth) return;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Check exclude patterns
        if (options?.excludePatterns?.some((p) => minimatch(relativePath, p)))
          continue;

        // Check gitignore if enabled (default true)
        if (
          options?.respectGitignore !== false &&
          (await fileSystem.isIgnored(fullPath))
        )
          continue;

        if (entry.isFile()) {
          // Check file pattern
          if (
            options?.filePattern &&
            !minimatch(entry.name, options.filePattern)
          )
            continue;

          await searchFile(fullPath);
        } else if (entry.isDirectory() && options?.recursive) {
          await searchDirectory(fullPath, depth + 1);
        }
      }
    };

    if (await fileSystem.isDirectory(basePath))
      await searchDirectory(basePath, 0);
    else await searchFile(basePath);

    // Check if we potentially truncated results due to size
    const wasTruncatedBySize = totalOutputSize >= MAX_OUTPUT_SIZE;
    const wasTruncatedByCount =
      options?.maxMatches && matches.length >= options.maxMatches;

    let message = `Found ${matches.length} matches in ${filesSearched} files`;
    if (wasTruncatedBySize) message += ' (truncated due to output size limit)';
    else if (wasTruncatedByCount) message += ' (truncated due to match limit)';

    return {
      success: true,
      message,
      matches,
      totalMatches: matches.length,
      filesSearched,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
