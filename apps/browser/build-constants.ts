import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Release channel: 'dev' | 'prerelease' | 'release'
type ReleaseChannel = 'dev' | 'prerelease' | 'release';
export const __APP_RELEASE_CHANNEL__: ReleaseChannel = (() => {
  switch (process.env.RELEASE_CHANNEL) {
    case 'release':
      return 'release';
    case 'prerelease':
      return 'prerelease';
    case 'dev':
    default:
      return 'dev';
  }
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
);

export const __APP_BASE_NAME__ = (() => {
  switch (__APP_RELEASE_CHANNEL__) {
    case 'release':
      return 'stagewise';
    case 'prerelease':
      return 'stagewise-prerelease';
    case 'dev':
    default:
      return 'stagewise-dev';
  }
})();

// App name includes channel suffix for differentiation
export const __APP_NAME__ = (() => {
  switch (__APP_RELEASE_CHANNEL__) {
    case 'release':
      return 'stagewise';
    case 'prerelease':
      return 'stagewise (Pre-Release)';
    case 'dev':
    default:
      return 'stagewise (Dev-Build)';
  }
})();

export const __APP_BUNDLE_ID__ = (() => {
  switch (__APP_RELEASE_CHANNEL__) {
    case 'release':
      return 'io.stagewise.app';
    case 'prerelease':
      return 'io.stagewise.prerelease';
    case 'dev':
    default:
      return 'io.stagewise.dev';
  }
})();

export const __APP_VERSION__ = (() => {
  const version = packageJson.version;
  if (typeof version !== 'string') {
    throw new Error('Version not found in package.json');
  }
  return version;
})();

export const __APP_AUTHOR__ = (() => {
  const author = packageJson.author;
  if (typeof author === 'string' && author.trim()) {
    return author;
  }
  if (
    author &&
    typeof author === 'object' &&
    typeof author.name === 'string' &&
    author.name.trim()
  ) {
    return author.name;
  }
  return 'GENERIC_AUTHOR';
})();

export const __APP_PLATFORM__ =
  process.env.npm_config_platform || process.platform;
export const __APP_ARCH__ = process.env.npm_config_arch || process.arch;

export const __APP_COPYRIGHT__ = `Copyright © ${new Date().getFullYear()} ${__APP_AUTHOR__}`;

export const __APP_HOMEPAGE__ = (() => {
  const homepage = packageJson.homepage;
  if (typeof homepage === 'string' && homepage.trim()) {
    return homepage;
  }
  return 'https://stagewise.io';
})();
