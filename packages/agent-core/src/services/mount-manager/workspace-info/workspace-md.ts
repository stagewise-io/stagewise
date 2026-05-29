import { resolve } from 'node:path';
import { readFile, stat } from '../../../fs';

export const WORKSPACE_MD_FILENAME = 'WORKSPACE.md';
export const WORKSPACE_MD_DIR = '.stagewise';

/**
 * Default mount-relative path to the WORKSPACE.md project memo
 * (`.stagewise/WORKSPACE.md`). Hosts override via
 * `AgentHost.workspaceMdRelativePath`.
 */
export const DEFAULT_WORKSPACE_MD_RELATIVE_PATH = `${WORKSPACE_MD_DIR}/${WORKSPACE_MD_FILENAME}`;

/**
 * Split a `<dir>/<file>` workspace-md relative path into its dir and
 * file segments. Throws when the input does not have exactly one
 * forward-slash separator (the mount watcher and renderer assume
 * this single-directory shape).
 */
export function splitWorkspaceMdRelativePath(relativePath: string): {
  dir: string;
  file: string;
} {
  const slashIdx = relativePath.indexOf('/');
  if (slashIdx <= 0 || slashIdx !== relativePath.lastIndexOf('/')) {
    throw new Error(
      `workspaceMdRelativePath must be "<dir>/<file>", got: ${relativePath}`,
    );
  }
  return {
    dir: relativePath.slice(0, slashIdx),
    file: relativePath.slice(slashIdx + 1),
  };
}

/**
 * Read the workspace-level WORKSPACE.md file (default path
 * `.stagewise/WORKSPACE.md`). Returns `null` when the file does not
 * exist or is unreadable. All fs access flows through the core `fs`
 * proxy (SPEC D24).
 */
export async function readWorkspaceMd(
  workspacePath: string,
  relativePath: string = DEFAULT_WORKSPACE_MD_RELATIVE_PATH,
): Promise<string | null> {
  try {
    const workspaceMdPath = resolve(workspacePath, relativePath);
    try {
      await stat(workspaceMdPath);
    } catch {
      return null;
    }
    return await readFile(workspaceMdPath, 'utf-8');
  } catch {
    return null;
  }
}
