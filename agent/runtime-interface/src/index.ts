import type { BaseFileSystemProvider } from './file-operations.js';
export {
  type FileChangeEvent,
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
} from './file-operations.js';

export interface ClientRuntime {
  fileSystem: BaseFileSystemProvider;
}
