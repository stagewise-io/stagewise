/**
 * Populates `pathReferences` on a user message's metadata by:
 * 1. Extracting `path:` links from the message text.
 * 2. Adding paths from `attachments` metadata (workspace files and blobs).
 * 3. Adding paths from `mentions` metadata (file mentions → mountedPath, workspace mentions → prefix).
 * 4. Resolving each mount-prefixed path to an absolute path.
 * 5. Hashing each resolved path (file content SHA-256, directory stat-hash).
 *
 * Paths that cannot be resolved or hashed (deleted files, missing mounts)
 * are silently skipped — they simply won't appear in `pathReferences`.
 */

import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { extractPathLinksFromMessage } from './path-references';
import { resolveMountedPath } from './resolve-path';
import { hashPath } from './hash';
import type { Logger } from '@/services/logger';

/**
 * Collect all mount-prefixed paths that should be tracked for a user message.
 *
 * Sources (deduplicated):
 * - `path:` markdown links in text parts
 * - `metadata.attachments[].path`
 * - `metadata.mentions[]` (file → mountedPath, workspace → prefix)
 */
function collectPathsFromUserMessage(message: AgentMessage): string[] {
  const paths = new Set<string>();

  // 1. path: links in text
  for (const p of extractPathLinksFromMessage(message)) {
    paths.add(p);
  }

  // 2. Attachment paths
  if (message.metadata?.attachments) {
    for (const att of message.metadata.attachments) {
      if (att.path) paths.add(att.path);
    }
  }

  // 3. Mention paths
  if (message.metadata?.mentions) {
    for (const mention of message.metadata.mentions) {
      switch (mention.providerType) {
        case 'file':
          if (mention.mountedPath) paths.add(mention.mountedPath);
          break;
        case 'workspace':
          // Workspace mention → treat root directory as a path reference.
          // This deliberately injects a directory listing even when individual
          // files under the same workspace are also referenced. The directory
          // listing provides structural context (what files/folders exist),
          // while individual file references provide content. Both are useful
          // and the deduplication set in the conversion pipeline ensures the
          // directory entry is only injected once.
          if (mention.prefix) paths.add(mention.prefix);
          break;
        // tab mentions are not file paths — skip
      }
    }
  }

  return [...paths];
}

/**
 * Populate `pathReferences` on a user message by extracting paths,
 * resolving them to absolute filesystem paths, and hashing their contents.
 *
 * This function mutates `message.metadata.pathReferences` in place.
 *
 * @param message — The user message to populate (must have `role === 'user'`).
 * @param agentId — Current agent instance ID.
 * @param mountPaths — Map of mount prefix → absolute root path.
 * @param logger — Logger for warnings on resolution/hash failures.
 */
export async function populatePathReferences(
  message: AgentMessage,
  agentId: string,
  mountPaths: Map<string, string>,
  logger: Logger,
): Promise<void> {
  if (message.role !== 'user') return;

  const mountedPaths = collectPathsFromUserMessage(message);
  if (mountedPaths.length === 0) return;

  const references: Record<string, string> = {};

  await Promise.all(
    mountedPaths.map(async (mountedPath) => {
      const absolutePath = resolveMountedPath(mountedPath, agentId, mountPaths);
      if (!absolutePath) {
        logger.debug(
          `[populatePathReferences] Skipping unresolvable path: "${mountedPath}"`,
        );
        return;
      }

      try {
        const hash = await hashPath(absolutePath);
        references[mountedPath] = hash;
      } catch (err) {
        logger.debug(
          `[populatePathReferences] Failed to hash "${mountedPath}" (${absolutePath}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }),
  );

  if (Object.keys(references).length > 0) {
    message.metadata ??= {
      createdAt: new Date(),
      partsMetadata: [],
    };
    message.metadata.pathReferences = references;
  }
}
