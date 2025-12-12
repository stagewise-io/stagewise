import unhandled from 'electron-unhandled';
unhandled();

import { app } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { main } from './main';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

// Set the app name for macOS menu bar
app.setName(
  process.env.BUILD_MODE === 'production' ? 'stagewise' : 'stagewise-dev',
);
app.applicationMenu = null;

// Set the right path structure for the app
// We keep userData where it is, but we will put session data into a sub-folder called "session"
app.setPath(
  'userData',
  path.join(
    app.getPath('appData'),
    process.env.BUILD_MODE === 'production' ? 'stagewise' : 'stagewise-dev',
  ),
);
app.setPath('sessionData', path.join(app.getPath('userData'), 'session'));

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => main({ launchOptions: { verbose: true } }));

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // macOS apps typically keep the app running when all windows are closed but I (glenn) think that is bs so we'll quit the app when all windows are closed - no matter which platform.
  app.quit();
});

app.on('activate', () => {});
