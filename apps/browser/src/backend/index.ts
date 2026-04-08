import unhandled from 'electron-unhandled';
unhandled();

import { app, protocol } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';

// CRITICAL: `main` is imported dynamically (below in the 'ready' handler)
// instead of statically. On Windows machines without the VC++ redistributable
// installed system-wide, static imports eagerly load native .node addons
// (@libsql, sharp, etc.) whose transitive vcruntime140.dll dependency cannot be
// resolved when the process is launched by Squirrel's Update.exe (different
// working directory). Keeping the import dynamic ensures Squirrel install/
// uninstall/update events are handled cleanly without touching native code.

const isSmokeTest = process.argv.includes('--smoke-test');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const appBaseName = (() => {
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

const appName = (() => {
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

// Set the app name for macOS menu bar
app.setName(appName);
if (process.platform === 'win32') {
  app.setAppUserModelId(`com.squirrel.${appBaseName}.${appBaseName}`);
}
app.applicationMenu = null;

// Set the right path structure for the app
// We keep userData where it is, but we will put session data into a sub-folder called "session"
app.setPath('userData', path.join(app.getPath('appData'), appBaseName));
app.setPath('sessionData', path.join(app.getPath('userData'), 'session'));

// Register custom protocols as privileged (must happen before app.ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'stagewise',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      codeCache: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'attachment',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'workspace',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'plans',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  // Don't load native modules during Squirrel install/uninstall events.
  // The process is about to quit — loading them would crash on Windows
  // machines without system-wide VC++ redistributable.
  if (started) return;

  if (isSmokeTest) {
    // Validate the full import tree is intact, then exit.
    await import('./main');
    console.log('[smoke-test] App ready — all modules loaded successfully.');
    app.exit(0);
    return;
  }

  const { main } = await import('./main');
  main({ launchOptions: { verbose: true } });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // macOS apps typically keep the app running when all windows are closed but I (glenn) think that is bs so we'll quit the app when all windows are closed - no matter which platform.
  app.quit();
});

app.on('activate', () => {});
