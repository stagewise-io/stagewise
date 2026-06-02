import { randomUUID } from 'node:crypto';

/**
 * Generates a sanitized, collision-resistant filename for an attachment stored
 * in the `att/` (data-attachments) directory. Same rules as the browser helper
 * but uses `randomUUID` instead of `@paralleldrive/cuid2` to avoid an extra
 * dependency in agent-core.
 */
export function generateAttachmentFilename(
  originalFilename: string,
  existingFilenames?: Set<string>,
): string {
  const lastDotIdx = originalFilename.lastIndexOf('.');
  const hasExtension =
    lastDotIdx > 0 && lastDotIdx < originalFilename.length - 1;

  const baseName = hasExtension
    ? originalFilename.slice(0, lastDotIdx)
    : originalFilename;
  const extension = hasExtension
    ? originalFilename
        .slice(lastDotIdx + 1)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
    : '';

  const sanitized = baseName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 10);

  const prefix = sanitized.length > 0 ? sanitized : 'file';

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    const filename = extension
      ? `${prefix}_${suffix}.${extension}`
      : `${prefix}_${suffix}`;

    if (!existingFilenames?.has(filename)) {
      return filename;
    }
  }

  const fallbackSuffix = randomUUID().replace(/-/g, '');
  return extension
    ? `${prefix}_${fallbackSuffix}.${extension}`
    : `${prefix}_${fallbackSuffix}`;
}
