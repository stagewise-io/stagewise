/**
 * Binary file detection settings
 */
export const BINARY_DETECTION = {
  /**
   * Number of bytes to check at the beginning of a file for binary detection.
   * 8–16KB catches most binaries while remaining cheap.
   */
  CHECK_BUFFER_SIZE: 8192, // 8KB
};
