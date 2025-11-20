import unhandled from 'electron-unhandled';
unhandled();

import { app } from 'electron';
import started from 'electron-squirrel-startup';

import { main } from './main';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Set the app name for macOS menu bar
app.setName('stagewise');

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () =>
  main({ launchOptions: { port: 3100, verbose: true, bridgeMode: true } }),
);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // macOS apps typically keep the app running when all windows are closed but I (glenn) think that is bs so we'll quit the app when all windows are closed - no matter which platform.
  if (process.platform === 'darwin') {
    return;
  }
  app.quit();
});

app.on('activate', () => {});
