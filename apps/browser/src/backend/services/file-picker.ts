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
import type { FilePickerRequest } from '@stagewise/karton-contract/shared-types';
import { dialog } from 'electron';

export class FilePickerService {
  private logger: Logger;
  private kartonService: KartonService;

  private constructor(logger: Logger, kartonService: KartonService) {
    this.logger = logger;
    this.kartonService = kartonService;
  }

  private async initialize() {
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
  public async createRequest(request: FilePickerRequest): Promise<string[]> {
    this.logger.debug(
      `Creating file picker request: ${JSON.stringify({ ...request, id: undefined })}`,
    );

    // TODO REPLACE WEVERYTHING IN HERE WITH A NATIVE PICKER DIALOG LOL
    const result = await dialog
      .showOpenDialog({
        title: request.title,
        message: request.description,
        properties: [
          request.type === 'directory' ? 'openDirectory' : 'openFile',
          'createDirectory',
          'treatPackageAsDirectory',
          request.multiple ? 'multiSelections' : undefined,
        ],
      })
      .then((result) => {
        if (result.canceled) {
          return [];
        }
        return result.filePaths;
      })
      .catch((error) => {
        this.logger.error(`Failed to show open dialog: ${error}`);
        return [] as string[];
      });

    return result;
  }
}
