import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ['./bundled'],
    icon: `./assets/icons/${releaseChannel}/icon`,
    appCopyright: `Copyright © ${new Date().getFullYear()} stagewise GmbH`,
    win32metadata: {
      CompanyName: 'stagewise GmbH',
      ProductName: appName,
      FileDescription: appName,
      'requested-execution-level': 'asInvoker',
    },
    name: appName,
    executableName: 'stagewise',
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
    new MakerSquirrel({}),
    new MakerRpm({}),
    new MakerDeb({}),
    new MakerDMG({
      format: 'UDZO',
      title: `Install ${appName}`,
      icon: `./assets/icons/${releaseChannel}/icon.icns`,
      additionalDMGOptions: {},
      background: './assets/install/macos-dmg-background.png',
      contents: [
        { x: 448, y: 200, type: 'link', path: '/Applications' },
        {
          x: 192,
          y: 200,
          type: 'file',
          path: `./out/${appName}-darwin-arm64/${appName}.app`,
        },
      ],
    }),
  ],
  plugins: [
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
    new AutoUnpackNativesPlugin({}),
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
