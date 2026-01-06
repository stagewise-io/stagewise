import { app } from 'electron';

/**
 * Returns the path to the global data directory for persisting user data.
 * This uses Electron's userData path which is platform-specific:
 * - macOS: ~/Library/Application Support/<app-name>
 * - Windows: %APPDATA%/<app-name>
 * - Linux: ~/.config/<app-name>
 */
export const getGlobalDataPath = (): string => app.getPath('userData');
