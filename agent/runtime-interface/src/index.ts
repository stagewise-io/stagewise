import type { BaseFileSystemProvider } from './file-operations.js';
export {
  BaseFileSystemProvider,
  type IFileSystemProvider,
  type FileSystemProviderConfig,
  type FileOperationResult,
  type FileContentResult,
  type DirectoryEntry,
  type DirectoryListResult,
  type GrepMatch,
  type GrepResult,
  type GlobResult,
  type SearchReplaceMatch,
  type SearchReplaceResult,
  type FuzzyFileSearchResult,
  type FileData,
} from './file-operations.js';

export interface ClientRuntime {
  fileSystem: BaseFileSystemProvider;
}
