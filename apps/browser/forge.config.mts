import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/icon',
    appCopyright: 'Copyright © 2025 stagewise GmbH',
    win32metadata: {
      CompanyName: 'stagewise GmbH',
      ProductName: 'stagewise',
      FileDescription: "The browser dev's always wished they had.",
    },
    name:
      process.env.BUILD_MODE === 'production' ? 'stagewise' : 'stagewise-dev',
    appBundleId:
      process.env.BUILD_MODE === 'production'
        ? 'io.stagewise.app'
        : 'io.stagewise.dev',
    appCategoryType: 'public.app-category.developer-tools',
    protocols: [
      {
        name: 'stagewise',
        schemes: ['stagewise'],
      },
    ],
    osxSign: {},
    osxNotarize: {
      appleId: process.env.APPLE_ID!,
      appleIdPassword: process.env.APPLE_PASSWORD!,
      teamId: process.env.APPLE_TEAM_ID!,
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerRpm({}),
    new MakerDeb({}),
    new MakerDMG({
      format: 'UDZO',
      title: 'Install stagewise',
      icon: './assets/icons/icon.icns',
      additionalDMGOptions: {},
      background: './assets/install/macos-dmg-background.png',
      contents: [
        { x: 448, y: 200, type: 'link', path: '/Applications' },
        {
          x: 192,
          y: 200,
          type: 'file',
          path: './out/stagewise-darwin-arm64/stagewise.app',
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
      ],
    }),
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
