import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { SquirrelInstallerNameFixPlugin } from './etc/forge-plugins/squirrel-installer-name-fix';
import { getWindowsSignConfig } from './etc/windows/windowsSign';
import path from 'node:path';
import fs from 'node:fs';
import * as buildConstants from './build-constants';

// Get Windows signing configuration (returns undefined if not configured)
const windowsSignConfig = getWindowsSignConfig();

/**
 * Release channel for the build.
 * Set via RELEASE_CHANNEL environment variable in CI workflows.
 *
 * - 'dev': Local development or CI builds on non-release commits
 * - 'prerelease': Alpha or beta releases (alpha.x, beta.x versions)
 * - 'release': Production releases (stable versions without prerelease suffix)
 */

// Log the release channel for debugging
console.log(
  `[forge.config] Release channel: ${buildConstants.__APP_RELEASE_CHANNEL__}`,
);
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
  buildIdentifier: buildConstants.__APP_RELEASE_CHANNEL__,
  packagerConfig: {
    asar: true,
    extraResource: [
      './bundled',
      `./assets/icons/${buildConstants.__APP_RELEASE_CHANNEL__}/icon.png`,
    ],
    prune: true,
    afterCopy: [copyNativeDependencies],
    icon: `./assets/icons/${buildConstants.__APP_RELEASE_CHANNEL__}/icon`,
    appCopyright: `Copyright © ${new Date().getFullYear()} stagewise Inc.`,
    win32metadata: {
      CompanyName: 'stagewise Inc.',
      ProductName: buildConstants.__APP_NAME__,
      FileDescription: buildConstants.__APP_NAME__,
      'requested-execution-level': 'asInvoker',
    },
    name: buildConstants.__APP_BASE_NAME__,
    executableName: buildConstants.__APP_BASE_NAME__,
    appBundleId: buildConstants.__APP_BUNDLE_ID__,
    appCategoryType: 'public.app-category.developer-tools',
    protocols: [
      {
        name: 'stagewise',
        schemes: ['stagewise'],
      },
    ],
    // macOS code signing (only for non-dev builds)
    ...(buildConstants.__APP_RELEASE_CHANNEL__ !== 'dev'
      ? {
          osxSign: {
            optionsForFile: (_filePath) => {
              return {
                entitlements: 'etc/macos/entitlements.plist',
              };
            },
            identity: process.env.APPLE_SIGNING_IDENTITY!,
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }
      : {}),
    // Windows code signing via Azure Trusted Signing (only when configured)
    ...(windowsSignConfig ? { windowsSign: windowsSignConfig } : {}),
  },
  rebuildConfig: {
    force: true,
  },
  makers: [
    new MakerSquirrel((arch) => ({
      name: buildConstants.__APP_BASE_NAME__,
      description: buildConstants.__APP_NAME__,
      version: buildConstants.__APP_VERSION__,
      setupExe: `${buildConstants.__APP_BASE_NAME__}-${buildConstants.__APP_VERSION__}-${arch}-setup.exe`,
      copyright: `Copyright © ${new Date().getFullYear()} stagewise Inc.`,
      setupIcon: `./assets/icons/${buildConstants.__APP_RELEASE_CHANNEL__}/icon.ico`,
      loadingGif: `./assets/install/${buildConstants.__APP_RELEASE_CHANNEL__}/windows-install-image.gif`,
      title: `Installing ${buildConstants.__APP_NAME__}...`,
      // Windows code signing for the installer (uses same config as packager)
      // @ts-expect-error - windowsSign type is not correctly exported by MakerSquirrel
      ...(windowsSignConfig ? { windowsSign: windowsSignConfig } : {}),
    })),
    new MakerRpm({
      options: {
        name: buildConstants.__APP_BASE_NAME__,
        bin: buildConstants.__APP_BASE_NAME__,
        productName: buildConstants.__APP_NAME__,
        genericName: 'Web Browser',
        icon: `./assets/icons/${buildConstants.__APP_RELEASE_CHANNEL__}/icon.png`,
        homepage: 'https://stagewise.io',
        categories: ['Development', 'Network', 'Utility'],
      },
    }),
    new MakerDeb({
      options: {
        name: buildConstants.__APP_BASE_NAME__,
        bin: buildConstants.__APP_BASE_NAME__,
        productName: buildConstants.__APP_NAME__,
        genericName: 'Web Browser',
        icon: `./assets/icons/${buildConstants.__APP_RELEASE_CHANNEL__}/icon.png`,
        homepage: 'https://stagewise.io',
        categories: ['Development', 'Network', 'Utility'],
        section: 'devel',
        priority: 'standard',
      },
    }),
    new MakerDMG({
      format: 'UDZO',
      title: dmgVolumeName,
      icon: `./assets/icons/${buildConstants.__APP_RELEASE_CHANNEL__}/icon.icns`,
      additionalDMGOptions: {},
      background: './assets/install/macos-dmg-background.png',
      contents: [
        { x: 448, y: 200, type: 'link', path: '/Applications' },
        {
          x: 192,
          y: 200,
          type: 'file',
          path: `./out/${buildConstants.__APP_RELEASE_CHANNEL__}/${buildConstants.__APP_BASE_NAME__}-darwin-arm64/${buildConstants.__APP_BASE_NAME__}.app`,
          name: `${buildConstants.__APP_NAME__}.app`,
        },
      ],
    }),
    new MakerZIP({}),
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
    new SquirrelInstallerNameFixPlugin({
      appBaseName: buildConstants.__APP_BASE_NAME__,
      version: buildConstants.__APP_VERSION__,
    }),
  ],
};

export default config;
