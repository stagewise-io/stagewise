/**
 * Normalizes a file path to always use POSIX forward slashes.
 * On Unix this is a no-op; on Windows it converts backslashes.
 */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}
