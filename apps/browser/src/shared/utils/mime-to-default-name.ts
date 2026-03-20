/**
 * Returns a human-readable default filename for a given MIME type.
 * Used when no real original filename is available (e.g. clipboard pastes).
 */
export function mimeToDefaultName(mimeType: string): string {
  const mime = (mimeType.split(';')[0] ?? mimeType).trim().toLowerCase();

  const map: Record<string, string> = {
    'image/png': 'image.png',
    'image/jpeg': 'image.jpg',
    'image/jpg': 'image.jpg',
    'image/gif': 'image.gif',
    'image/webp': 'image.webp',
    'image/svg+xml': 'image.svg',
    'image/bmp': 'image.bmp',
    'image/tiff': 'image.tiff',
    'image/avif': 'image.avif',
    'application/pdf': 'document.pdf',
    'text/plain': 'document.txt',
    'text/html': 'document.html',
    'text/css': 'document.css',
    'text/javascript': 'script.js',
    'application/javascript': 'script.js',
    'application/json': 'data.json',
    'application/xml': 'data.xml',
    'text/xml': 'data.xml',
    'text/csv': 'data.csv',
    'application/zip': 'archive.zip',
    'application/x-tar': 'archive.tar',
    'application/gzip': 'archive.gz',
  };

  if (map[mime]) return map[mime];

  // Generic fallback using the subtype (e.g. "application/octet-stream" → "file")
  const subtype = mime.split('/')[1];
  if (subtype && subtype !== 'octet-stream') {
    return `file.${subtype.replace(/[^a-z0-9]/g, '')}`;
  }
  return 'file';
}
