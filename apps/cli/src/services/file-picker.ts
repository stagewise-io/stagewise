/**
 * This file contains a file picker service that other services may use to request the user to select a file or directory.
 * We implement this on our own, because there is literally no proper directory picker lib in the node ecosystem and the browser doesn't offer clear paths.
 * Electron offers something, but we don't use electron (for now), so...
 *
 * The way this works is:
 * - When a request comes in, we update the UI through karton to show a file picker dialog with the configured title, description etc.
 * - The initial directory is the working directory of the app.
 * - The user can jump between folders etc. and either create new folders or select files (bsed on handlers for karton procedures).
 * - Whenever the user changes directory, we update the UI through karton to show the new directory.
 * - When new requests come in while the current request is still active, they are queued up.
 * - The user ay dismiss a request at any time, which should lead to a Exception being thrown and the request being closed. ("UserDismissedRequestException").
 * - When a request is either closed or dismissed, we respond to the request with the result and update the UI to not show the request anymore.
 * - When other requests exists in the queue, they are rendered 200ms after the last request was either closed or dismissed.
 */

import type { Logger } from './logger';
import type { KartonService } from './karton';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FilePickerRequest } from '@stagewise/karton-contract/shared-types';

class InvalidUserSelectionException extends Error {
  constructor(message = 'InvalidUserSelectionException') {
    super(message);
    this.name = 'InvalidUserSelectionException';
  }
}

class UserDismissedRequestException extends Error {
  constructor(message = 'UserDismissedRequestException') {
    super(message);
    this.name = 'UserDismissedRequestException';
  }
}

type RequestResolver = {
  resolve: (value: string[]) => void;
  reject: (reason?: unknown) => void;
};

export class FilePickerService {
  private logger: Logger;
  private requestQueue: Map<string, FilePickerRequest> = new Map();
  private kartonService: KartonService;
  private currentDirectory: string | null = null;
  private currentRequestId: string | null = null;
  private resolvers: Map<string, RequestResolver> = new Map();

  private constructor(logger: Logger, kartonService: KartonService) {
    this.logger = logger;
    this.kartonService = kartonService;
  }

  private async initialize() {
    this.currentDirectory = process.cwd();
    this.kartonService.registerServerProcedureHandler(
      'filePicker.createFolder',
      async (p: string) => this.handleFolderCreation(p),
    );
    this.kartonService.registerServerProcedureHandler(
      'filePicker.changeDirectory',
      async (p: string) => this.handleDirectoryChange(p),
    );
    this.kartonService.registerServerProcedureHandler(
      'filePicker.dismiss',
      async () => this.handleUserDismissal(),
    );
    this.kartonService.registerServerProcedureHandler(
      'filePicker.select',
      async (paths: string[]) => this.handleUserSelection(paths),
    );
    this.kartonService.registerServerProcedureHandler(
      'filePicker.createRequest',
      async (request: FilePickerRequest) => this.createRequest(request),
    );
  }

  public static async create(
    logger: Logger,
    kartonService: KartonService,
  ): Promise<FilePickerService> {
    const instance = new FilePickerService(logger, kartonService);
    await instance.initialize();
    return instance;
  }

  /**
   * Create a new file picker request. One request at a time can be active. The user will wait
   * @param request The request to create.
   * @returns The path selected by the user.
   */
  public async createRequest(
    request: FilePickerRequest,
    abortSignal?: AbortSignal,
  ): Promise<string[]> {
    this.logger.debug(
      `Creating file picker request: ${JSON.stringify({ ...request, id: undefined })}`,
    );

    const requestId = crypto.randomUUID();

    const promise = new Promise<string[]>((resolve, reject) => {
      this.resolvers.set(requestId, { resolve, reject });
    });

    this.requestQueue.set(requestId, request);

    if (!this.currentRequestId) {
      this.currentRequestId = requestId;
      await this.updateDisplayedState();
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        this.removeRequest(requestId);
        throw new Error('Aborted');
      }
      const abortHandler = () => {
        this.logger.warn(`File picker request aborted: ${requestId}`);
        this.rejectRequest(requestId, new Error('Aborted'));
        this.removeRequest(requestId);
      };
      abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    return promise;
  }

  private async updateDisplayedState() {
    // Once a user action was triggered (e.g. a folder was created or a different folder was opened etc.), we need to update the displayed state.
    if (this.requestQueue.size === 0 || !this.currentRequestId) {
      this.kartonService.setState((draft) => {
        draft.filePicker = null;
      });
      return;
    }

    const active = this.requestQueue.get(this.currentRequestId);
    if (!active) {
      this.kartonService.setState((draft) => {
        draft.filePicker = null;
      });
      return;
    }

    const currentPath = path.resolve(this.currentDirectory ?? process.cwd());
    const [parentSiblings, children] = await Promise.all([
      this.getParentSiblingDirectories(currentPath),
      this.getChildren(currentPath),
    ]);

    const title =
      active.title ||
      (active.type === 'directory' ? 'Select a folder' : 'Select a file');
    const description =
      active.description ||
      (active.type === 'directory' ? 'Choose a directory' : 'Choose a file');

    this.kartonService.setState((draft) => {
      draft.filePicker = {
        title,
        description,
        mode: active.type,
        multiple: active.multiple ?? false,
        currentPath,
        parentSiblings,
        children,
      };
    });
  }

  private async handleDirectoryChange(targetPath: string) {
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = targetPath.replace(/\\/g, '/');
    const resolved = path.resolve(normalizedPath);
    const isDir = await this.pathIsDirectory(resolved);
    if (!isDir) {
      throw new Error(`Path is not a directory: ${resolved}`);
    }
    this.currentDirectory = resolved;
    await this.updateDisplayedState();
  }

  private async handleFolderCreation(targetPath: string) {
    const active = this.getActiveRequest();
    if (!active) return;
    if (!active.allowCreateDirectory) {
      throw new InvalidUserSelectionException();
    }
    const dirPath = path.resolve(targetPath);
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      this.logger.error(
        `Failed to create folder at ${dirPath}: ${(err as Error).message}`,
      );
      throw err;
    }
    await this.updateDisplayedState();
  }

  private async handleUserSelection(paths: string[]) {
    const active = this.getActiveRequest();
    if (!active) return; // We ignore the selection if there is no active request.

    // Validate selection according to configuration
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new InvalidUserSelectionException('No paths selected.');
    }

    if (!active.multiple && paths.length !== 1) {
      throw new InvalidUserSelectionException(
        'Multiple paths selected, but multiple selection is not allowed.',
      );
    }

    // Validate each selected path
    const validations = await Promise.all(
      paths.map(async (p) => {
        const resolved = path.resolve(p);
        const stats = await this.safeStat(resolved);
        if (!stats) return false;
        return active.type === 'directory'
          ? stats.isDirectory()
          : stats.isFile();
      }),
    );

    if (validations.some((v) => v === false)) {
      throw new InvalidUserSelectionException('Invalid path selected.');
    }

    // Resolve all selected paths
    const selectedPaths = paths.map((p) => path.resolve(p));

    this.logger.debug(
      `[FilePickerService] User selected path: ["${selectedPaths.join('", "')}"]`,
    );

    // Resolve and close current request
    const resolver = this.resolvers.get(this.currentRequestId!);
    if (resolver) {
      resolver.resolve(selectedPaths);
      this.resolvers.delete(this.currentRequestId!);
    }
    this.removeRequest(this.currentRequestId!);

    // Small delay before rendering next queued request
    setTimeout(() => {
      void this.updateDisplayedState();
    }, 200);
  }

  private async handleUserDismissal() {
    const active = this.getActiveRequest();
    if (!active) return;
    const resolver = this.resolvers.get(this.currentRequestId!);
    if (resolver) {
      resolver.reject(new UserDismissedRequestException());
      this.resolvers.delete(this.currentRequestId!);
    }
    this.logger.debug('[FilePickerService] User dismissed request');
    this.removeRequest(this.currentRequestId!);
    setTimeout(() => {
      void this.updateDisplayedState();
    }, 200);
  }

  private getActiveRequest(): FilePickerRequest | null {
    if (!this.currentRequestId) return null;
    return this.requestQueue.get(this.currentRequestId) ?? null;
  }

  private removeRequest(id: string) {
    this.requestQueue.delete(id);
    if (this.currentRequestId === id) {
      // Set next queued request (if any) as current
      const nextId = this.requestQueue.keys().next().value as
        | string
        | undefined;
      this.currentRequestId = nextId ?? null;
      if (this.currentRequestId) {
        // Reset directory for the next request to the app working directory
        this.currentDirectory = process.cwd();
      }
    }
  }

  private rejectRequest(id: string, reason?: unknown) {
    const resolver = this.resolvers.get(id);
    if (resolver) {
      resolver.reject(reason);
      this.resolvers.delete(id);
    }
  }

  private async pathIsDirectory(p: string): Promise<boolean> {
    const stats = await this.safeStat(p);
    return !!stats && stats.isDirectory();
  }

  private async safeStat(p: string) {
    try {
      return await fs.stat(p);
    } catch {
      return null;
    }
  }

  private async getChildren(
    dirPath: string,
  ): Promise<{ path: string; type: 'directory' | 'file' }[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .map((e) => ({
          path: path.join(dirPath, e.name),
          type: e.isFile() ? ('file' as const) : ('directory' as const),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
    } catch (err) {
      this.logger.debug?.(
        `[FilePickerService] Unable to list child files for ${dirPath}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private async getParentSiblingDirectories(
    currentPath: string,
  ): Promise<{ path: string; type: 'directory' | 'file' }[][]> {
    const ancestors: { path: string; type: 'directory' | 'file' }[] = [];
    let p = path.resolve(currentPath);
    while (true) {
      const parent = path.dirname(p);
      ancestors.push({ path: parent, type: 'directory' });
      if (parent === p) break; // reached root
      p = parent;
    }
    // ancestors: [parent, ..., root]
    const ordered = ancestors.reverse();
    const lists: { path: string; type: 'directory' | 'file' }[][] = [];
    for (const dir of ordered) {
      const children = (await this.getChildren(dir.path)).filter(
        (c) => c.type === 'directory',
      );
      lists.push(children);
    }
    return lists;
  }
}
