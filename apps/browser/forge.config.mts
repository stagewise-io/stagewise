import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Release channel for the build.
 * Set via RELEASE_CHANNEL environment variable in CI workflows.
 *
 * - 'dev': Local development or CI builds on non-release commits
 * - 'prerelease': Alpha or beta releases (alpha.x, beta.x versions)
 * - 'release': Production releases (stable versions without prerelease suffix)
 */
type ReleaseChannel = 'dev' | 'prerelease' | 'release';

const releaseChannel: ReleaseChannel =
  (process.env.RELEASE_CHANNEL as ReleaseChannel) || 'dev';

// Log the release channel for debugging
console.log(`[forge.config] Release channel: ${releaseChannel}`);
console.log(
  `[forge.config] Build mode: ${process.env.BUILD_MODE || 'development'}`,
);

const appBaseName = (() => {
  switch (releaseChannel) {
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
const appName = (() => {
  switch (releaseChannel) {
    case 'release':
      return 'stagewise';
    case 'prerelease':
      return 'stagewise (Pre-Release)';
    case 'dev':
    default:
      return 'stagewise (Dev-Build)';
  }
})();

const appBundleId = (() => {
  switch (releaseChannel) {
    case 'release':
      return 'io.stagewise.app';
    case 'prerelease':
      return 'io.stagewise.prerelease';
    case 'dev':
    default:
      return 'io.stagewise.dev';
  }
})();

// DMG volume name (shown when mounted)
const dmgVolumeName = 'Install stagewise';

// For now, we maintain a manually updated list of dependencies and sub-dependencies that need to be copied over in order to get a working deployed app.
// Ugly but works.
const nativeDependencies = [
  '@libsql',
  'libsql',
  '@neon-rs',
  'promise-limit',
  'js-base64',
  'ws',
];

const copyNativeDependencies = (
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (error?: Error) => void,
) => {
  for (const dependency of nativeDependencies) {
    const src = path.resolve(__dirname, `../../node_modules/${dependency}`);
    const dest = path.join(buildPath, 'node_modules', dependency);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      throw new Error(`Missing native dependency ${dependency}`);
    }
  }
  callback();
};

const config: ForgeConfig = {
  buildIdentifier: releaseChannel,
  packagerConfig: {
    asar: true,
    extraResource: ['./bundled', `./assets/icons/${releaseChannel}/icon.png`],
    prune: true,
    afterCopy: [copyNativeDependencies],
    icon: `./assets/icons/${releaseChannel}/icon`,
    appCopyright: `Copyright © ${new Date().getFullYear()} stagewise Inc.`,
    win32metadata: {
      CompanyName: 'stagewise Inc.',
      ProductName: appName,
      FileDescription: appName,
      'requested-execution-level': 'asInvoker',
    },
    name: appBaseName,
    executableName: appBaseName,
    appBundleId: appBundleId,
    appCategoryType: 'public.app-category.developer-tools',
    protocols: [
      {
        name: 'stagewise',
        schemes: ['stagewise'],
      },
    ],
    ...(releaseChannel !== 'dev'
      ? {
          osxSign: {
            optionsForFile: (_filePath) => {
              return {
                entitlements: 'etc/macos/entitlements.plist',
              };
            },
            identity: 'Developer ID Application: stagewise GmbH (FJCSRR9S5H)',
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }
      : {}),
  },
  rebuildConfig: {
    force: true,
  },
  makers: [
    new MakerSquirrel({
      name: appBaseName,
      copyright: `Copyright © ${new Date().getFullYear()} stagewise Inc.`,
      setupIcon: `./assets/icons/${releaseChannel}/icon.ico`,
      description: appName,
    }),
    new MakerRpm({
      options: {
        name: appBaseName,
        bin: appBaseName,
        productName: appName,
        genericName: 'Web Browser',
        icon: `./assets/icons/${releaseChannel}/icon.png`,
        homepage: 'https://stagewise.io',
        categories: ['Development', 'Network', 'Utility'],
      },
    }),
    new MakerDeb({
      options: {
        name: appBaseName,
        bin: appBaseName,
        productName: appName,
        genericName: 'Web Browser',
        icon: `./assets/icons/${releaseChannel}/icon.png`,
        homepage: 'https://stagewise.io',
        categories: ['Development', 'Network', 'Utility'],
        section: 'devel',
        priority: 'standard',
      },
    }),
    new MakerDMG({
      format: 'UDZO',
      title: dmgVolumeName,
      icon: `./assets/icons/${releaseChannel}/icon.icns`,
      additionalDMGOptions: {},
      background: './assets/install/macos-dmg-background.png',
      contents: [
        { x: 448, y: 200, type: 'link', path: '/Applications' },
        {
          x: 192,
          y: 200,
          type: 'file',
          path: `./out/${releaseChannel}/${appBaseName}-darwin-arm64/${appBaseName}.app`,
          name: `${appName}.app`,
        },
      ],
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/backend/index.ts',
          config: 'vite.backend.config.ts',
          target: 'main',
        },
        {
          entry: 'src/ui-preload/index.ts',
          config: 'vite.ui-preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/web-content-preload/index.ts',
          config: 'vite.web-content-preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.ui.config.ts',
        },
        {
          name: 'pages',
          config: 'vite.pages.config.ts',
        },
      ],
    }),
    // new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
