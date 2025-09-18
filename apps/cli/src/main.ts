/**
 * This file stores the main setup for the CLI.
 */

export type MainOptions = {
  launchOptions: {
    port?: number;
    appPort?: number; // Will only be respected on the initially launched workspace.
    workspacePath?: string;
    verbose?: boolean;
    bridgeMode?: boolean;
  };
};

export function main({
  launchOptions: {
    port = 3100,
    appPort,
    workspacePath = process.cwd(),
    verbose = false,
    bridgeMode = false,
  },
}: MainOptions) {
  // TODO: Initialize the Karton server for syncing with UI. Globally unique.
  // TODO: Start the browser server for UI, proxying, etc.
  // TODO: Initialize the workspace manager.
  // TODO: Trigger the workspace manager to load the initial workspace.
}
