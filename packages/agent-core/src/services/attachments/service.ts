import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HostPaths } from '../../host';
import {
  access,
  copyFile,
  createReadStream,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
  type ReadStream,
} from '../../fs';

/**
 * Per-agent on-disk attachment blob store.
 *
 * Each attachment is identified by `(agentId, attachmentId)` and stored at
 * `host.agentAttachmentPath(agentId, attachmentId)`. Writes go through a
 * temp-then-rename dance for atomicity. Per-agent cleanup is exposed via
 * `deleteAgentBlobs()`; the agent-manager fires it when an agent is hard
 * deleted (archive intentionally preserves blobs so a resumed agent can
 * still read its attachments).
 *
 * Construction is cheap and stateless — the service holds only the
 * injected `HostPaths` reference and does not open any handles up front.
 */
export class AttachmentsService {
  private readonly paths: HostPaths;

  constructor(paths: HostPaths) {
    this.paths = paths;
  }

  /**
   * Returns the per-agent attachment directory (may not exist yet).
   */
  public agentBlobDir(agentId: string): string {
    return this.paths.agentAttachmentsDir(agentId);
  }

  /**
   * Returns the absolute path of an attachment blob (may not exist yet).
   */
  public blobPath(agentId: string, attachmentId: string): string {
    return this.paths.agentAttachmentPath(agentId, attachmentId);
  }

  /**
   * Write attachment content to disk using temp-then-rename for atomicity.
   * Accepts either a Buffer (for IPC-transferred data) or a filesystem path
   * (for direct copy from a dropped file).
   */
  public async write(
    agentId: string,
    attachmentId: string,
    source: Buffer | string,
  ): Promise<void> {
    const dir = this.paths.agentAttachmentsDir(agentId);
    await mkdir(dir, { recursive: true });

    const finalPath = this.paths.agentAttachmentPath(agentId, attachmentId);
    const tempPath = path.join(dir, `tmp-${randomUUID()}`);

    try {
      if (typeof source === 'string') {
        await copyFile(source, tempPath);
      } else {
        await writeFile(tempPath, source);
      }
      await rename(tempPath, finalPath);
    } catch (err) {
      await unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  public async read(agentId: string, attachmentId: string): Promise<Buffer> {
    const filePath = this.paths.agentAttachmentPath(agentId, attachmentId);
    return readFile(filePath);
  }

  public readStream(agentId: string, attachmentId: string): ReadStream {
    const filePath = this.paths.agentAttachmentPath(agentId, attachmentId);
    return createReadStream(filePath);
  }

  public async deleteAgentBlobs(agentId: string): Promise<void> {
    const dir = this.paths.agentAttachmentsDir(agentId);
    await rm(dir, { recursive: true, force: true });
  }

  public async exists(agentId: string, attachmentId: string): Promise<boolean> {
    try {
      await access(this.paths.agentAttachmentPath(agentId, attachmentId));
      return true;
    } catch {
      return false;
    }
  }
}
