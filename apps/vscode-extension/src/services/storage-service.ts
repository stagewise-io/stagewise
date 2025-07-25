import * as vscode from 'vscode';
import { TextEncoder, TextDecoder } from 'node:util'; // Node.js built-in
import { VScodeContext } from './vscode-context';

/**
 * A reusable class to manage key-value storage within an extension's globalStorageUri.
 * This ensures that all stored data is properly cleaned up when an extension is uninstalled.
 *
 * It stores each key-value pair as a separate file in the extension's storage directory,
 * using JSON for serialization.
 */
export class StorageService {
  private static instance: StorageService;
  private context = VScodeContext.getInstance();
  private storageUri!: vscode.Uri;
  private textEncoder = new TextEncoder(); // For converting string to Uint8Array (UTF-8)
  private textDecoder = new TextDecoder(); // For converting Uint8Array to string (UTF-8)
  private initializePromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance() {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public async initialize(): Promise<void> {
    // Ensure initialize is only called once and subsequent calls wait for completion
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.doInitialize();
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    if (!this.context.isInitialized()) {
      throw new Error(
        'VScodeContext has not been initialized. Call VScodeContext.getInstance().initialize(context) first.',
      );
    }
    this.storageUri = this.context.getContext()!.globalStorageUri;
    // ensure storage directory exists
    await vscode.workspace.fs.createDirectory(this.storageUri);
  }

  /**
   * Ensures the storage is initialized before any operation.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initializePromise) {
      throw new Error(
        'StorageService has not been initialized. Call initialize() first.',
      );
    }
    await this.initializePromise;
  }

  /**
   * Retrieves a value from the storage.
   * @param key The key of the data to retrieve.
   * @param defaultValue A default value to return if the key doesn't exist.
   * @returns The stored value, the default value, or undefined.
   */
  public async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    await this.ensureInitialized();
    const fileUri = this.getUriForKey(key);

    try {
      // Read the file content from the storage directory.
      const fileContents = await vscode.workspace.fs.readFile(fileUri);
      // Decode the content from bytes to a string and parse it as JSON.
      const storedValue = JSON.parse(this.textDecoder.decode(fileContents));
      return storedValue as T;
    } catch (error) {
      // If the file doesn't exist, it's not an error we need to throw.
      if (
        error instanceof vscode.FileSystemError &&
        error.code === 'FileNotFound'
      ) {
        // We just return the default value.
        return defaultValue;
      }
      // For any other errors, we re-throw them.
      throw error;
    }
  }

  /**
   * Stores a value.
   * @param key The key under which to store the data.
   * @param value The value to store. Must be JSON-serializable.
   */
  public async set<T>(key: string, value: T): Promise<void> {
    await this.ensureInitialized();
    const fileUri = this.getUriForKey(key);
    // Serialize the value to a JSON string, then encode it as UTF-8 bytes.
    const fileContents = this.textEncoder.encode(JSON.stringify(value));

    try {
      // Ensure the storage directory exists (defensive programming)
      await vscode.workspace.fs.createDirectory(this.storageUri);
      // Write the data to the file.
      await vscode.workspace.fs.writeFile(fileUri, fileContents);
    } catch (error) {
      // Log and re-throw the error for the caller to handle.
      console.error(`Error writing to extension storage (key: ${key}):`, error);
      throw error;
    }
  }

  /**
   * Deletes a key and its associated value from the storage.
   * @param key The key to delete.
   */
  public async delete(key: string): Promise<void> {
    await this.ensureInitialized();
    const fileUri = this.getUriForKey(key);
    try {
      // Delete the file.
      await vscode.workspace.fs.delete(fileUri);
    } catch (error) {
      // If the file doesn't exist, that's fine. We can ignore the error.
      if (
        error instanceof vscode.FileSystemError &&
        error.code === 'FileNotFound'
      ) {
        return;
      }
      // For any other errors, we re-throw them.
      throw error;
    }
  }

  /**
   * Sanitizes a key to ensure it's a valid filename.
   * @param key The original key.
   * @returns A sanitized key safe for use as a filename.
   */
  private sanitizeKey(key: string): string {
    // Replace invalid filename characters with underscores
    // Invalid characters: / \ : * ? " < > |
    return key.replace(/[/\\:*?"<>|]/g, '_');
  }

  /**
   * Helper method to get the full URI for a given storage key.
   * @param key The storage key.
   * @returns A vscode.Uri object pointing to the file for the key.
   */
  private getUriForKey(key: string): vscode.Uri {
    // Sanitize the key to ensure it's a valid filename
    const sanitizedKey = this.sanitizeKey(key);
    // Uri.joinPath handles path separators correctly across OSes.
    return vscode.Uri.joinPath(this.storageUri, sanitizedKey);
  }
}
