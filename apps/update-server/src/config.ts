export const config = {
  port: Number.parseInt(process.env.PORT || '3000', 10),
  appName: process.env.APP_NAME || 'stagewise',
  githubOrg: process.env.APP_GITHUB_ORG || 'stagewise',
  githubRepo: process.env.APP_GITHUB_REPO || 'stagewise',
  githubToken: process.env.GITHUB_TOKEN || undefined,
  refreshIntervalMs: 15 * 60 * 1000, // 15 minutes
};

export type Channel = 'release' | 'beta' | 'alpha';
export type Platform = 'macos' | 'win' | 'linux';
export type LinuxFormat = 'deb' | 'rpm';
