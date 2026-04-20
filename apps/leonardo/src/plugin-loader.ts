import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * The interface every plugin must satisfy.
 */
export interface Plugin {
  name: string;
  version: string;
  greet(who: string): string;
  add(a: number, b: number): number;
}

/**
 * Resolve plugin directory relative to the executable (SEA) or cwd (dev).
 */
function getPluginsDir(): string {
  // Inside a SEA, import.meta.url is synthetic — use the executable path.
  // In dev (tsx), process.execPath is the node binary, so fall back to cwd.
  const isSea = !!(process as NodeJS.Process & { __sea?: unknown }).__sea;

  // Simple heuristic: if our binary name contains "leonardo", we're in SEA mode.
  const exeName = process.execPath.split('/').pop() ?? '';
  const runningAsSea =
    exeName === 'leonardo' || exeName === 'leonardo.exe' || isSea;

  if (runningAsSea) {
    return resolve(dirname(process.execPath), 'plugins');
  }
  return resolve(process.cwd(), 'plugins');
}

/**
 * Dynamically load a plugin .mjs file by name.
 */
export async function loadPlugin(name: string): Promise<Plugin> {
  const dir = getPluginsDir();
  const filePath = resolve(dir, `${name}.mjs`);

  if (!existsSync(filePath)) {
    throw new Error(`Plugin not found: ${filePath}`);
  }

  // Dynamic import with a runtime-computed path — esbuild won't bundle this.
  const mod = await import(filePath);
  const plugin: Plugin = mod.default ?? mod;

  // Validate the loaded module satisfies the Plugin interface
  if (typeof plugin.name !== 'string') {
    throw new Error(`Plugin "${name}" missing required "name" export`);
  }
  if (typeof plugin.version !== 'string') {
    throw new Error(`Plugin "${name}" missing required "version" export`);
  }
  if (typeof plugin.greet !== 'function') {
    throw new Error(`Plugin "${name}" missing required "greet" function`);
  }
  if (typeof plugin.add !== 'function') {
    throw new Error(`Plugin "${name}" missing required "add" function`);
  }

  return plugin;
}
