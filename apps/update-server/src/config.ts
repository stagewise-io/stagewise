export const config = {
  port: Number.parseInt(process.env.PORT || '3000', 10),
  appName: process.env.APP_NAME || 'stagewise',
  githubOrg: process.env.APP_GITHUB_ORG || 'stagewise',
  githubRepo: process.env.APP_GITHUB_REPO || 'stagewise',
  githubToken: process.env.GITHUB_TOKEN || undefined,
  refreshIntervalMs: 15 * 60 * 1000, // 15 minutes
  // Public-facing base URL of this update server (e.g. https://update.stagewise.io).
  // Used when building self-referential proxy URLs inside Squirrel.Windows
  // RELEASES manifests. REQUIRED in production (enforced at startup); in
  // non-production environments we fall back to the request-derived origin.
  publicUrl: process.env.PUBLIC_URL || undefined,
  isProduction: process.env.NODE_ENV === 'production',
};

/**
 * Validate runtime configuration. Called at startup so misconfigured
 * deployments fail fast (health check fails → Railway rolls back) instead
 * of serving broken RELEASES manifests to users.
 */
export function validateConfig(): void {
  if (config.isProduction && !config.publicUrl) {
    throw new Error(
      'FATAL: PUBLIC_URL must be set in production. ' +
        'This is required to build self-referential URLs in Squirrel.Windows ' +
        'RELEASES manifests. Example: PUBLIC_URL=https://dl.stagewise.io',
    );
  }
}

export type Channel = 'release' | 'beta' | 'alpha';
export type Platform = 'macos' | 'win' | 'linux';
export type LinuxFormat = 'deb' | 'rpm';
