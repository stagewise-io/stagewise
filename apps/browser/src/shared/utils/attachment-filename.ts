import { init } from '@paralleldrive/cuid2';

const createId = init({ length: 8 });

/**
 * Generates a sanitized, collision-resistant filename for an attachment stored
 * in the `att/` (data-attachments) directory.
 *
 * Format: `{sanitized_prefix}_{8-char-cuid2}.{ext}`
 *
 * Rules:
 * 1. Take original filename (without extension)
 * 2. Replace spaces with underscores
 * 3. Remove all characters except `[a-zA-Z0-9_-]`
 * 4. Lowercase
 * 5. Truncate to first 10 characters
 * 6. If empty after sanitization (e.g. unicode-only), fall back to `"file"`
 * 7. Append `_` + 8-character CUID2
 * 8. Append `.` + original file extension (lowercased), if present
 *
 * Examples:
 *   `My Screenshot (2).png` → `my_screens_a8kt2m1x.png`
 *   `数据.csv`              → `file_b3xb9p2y.csv`
 *   `Makefile`              → `makefile_x9m3pq4z`  (no extension)
 *   `app.config.ts`         → `app_confi_k7b2nm9w.ts`
 *
 * @param originalFilename  - The original filename (basename + extension) from
 *                            the uploaded file or a synthesized name.
 * @param existingFilenames - Optional set of already-used filenames for
 *                            collision detection (safety net — extremely rare).
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
    ? originalFilename.slice(lastDotIdx + 1).toLowerCase()
    : '';

  // Sanitize: lowercase, replace spaces with underscores, strip non-alphanumeric
  const sanitized = baseName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 10);

  // Fallback when sanitization produces an empty string (e.g. unicode-only names)
  const prefix = sanitized.length > 0 ? sanitized : 'file';

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = createId();
    const filename = extension
      ? `${prefix}_${suffix}.${extension}`
      : `${prefix}_${suffix}`;

    if (!existingFilenames?.has(filename)) {
      return filename;
    }
  }

  // Extremely unlikely fallback: use a longer suffix if all 5 attempts collided
  const fallbackSuffix = `${createId()}${createId()}`;
  return extension
    ? `${prefix}_${fallbackSuffix}.${extension}`
    : `${prefix}_${fallbackSuffix}`;
}
