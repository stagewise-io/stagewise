import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getInstalledDependencies as getInstalledDependenciesFromBun } from './lock-file-parsers/bun';
import { getInstalledDependencies as getInstalledDependenciesFromNpm } from './lock-file-parsers/npm';
import { getInstalledDependencies as getInstalledDependenciesFromPnpm } from './lock-file-parsers/pnpm';
import { getInstalledDependencies as getInstalledDependenciesFromYarn } from './lock-file-parsers/yarn';
import type { Dependencies } from './lock-file-parsers/types';
import { compareVersions as compareVersionsUtil } from './lock-file-parsers/version-comparator';

const LOCK_FILES = [
  { name: 'package-lock.json', parser: getInstalledDependenciesFromNpm },
  { name: 'yarn.lock', parser: getInstalledDependenciesFromYarn },
  { name: 'pnpm-lock.yaml', parser: getInstalledDependenciesFromPnpm },
  { name: 'bun.lock', parser: getInstalledDependenciesFromBun },
];

const WEB_APP_DEPS = [
  'next',
  'react',
  'vue',
  'preact',
  'angular',
  'solidjs',
  'svelte',
  'sveltekit',
  'htmx',
];

export class WorkspaceService {
  private static instance: WorkspaceService;

  private constructor() {}

  public static getInstance() {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }

  public getToolbarInstallations(): Array<{
    version: string;
    path: string;
  }> {
    const toolbarInstallations: Array<{ version: string; path: string }> = [];

    this.forEachWorkspaceFolderWithLockFile((dependencies, lockFilePath) => {
      const toolbarPackages = Object.entries(dependencies).filter(([key]) =>
        key.startsWith('@stagewise/toolbar'),
      );

      if (toolbarPackages.length > 0) {
        const versions = toolbarPackages.map(([_, version]) => version);
        const lowestVersion = versions.reduce((lowest, current) => {
          return this.compareVersions(current, lowest) < 0 ? current : lowest;
        }, versions[0]);

        toolbarInstallations.push({
          version: lowestVersion,
          path: lockFilePath,
        });
      }
      return undefined;
    });

    return toolbarInstallations;
  }

  public isWebAppWorkspace(): boolean {
    console.log(
      '[WorkspaceService] Checking if workspace is a web app workspace',
    );
    let foundWebAppDep = false;
    this.forEachWorkspaceFolderWithLockFile((dependencies) => {
      if (this.hasWebAppDeps(dependencies)) {
        console.log('[WorkspaceService] Found web app dependencies');
        foundWebAppDep = true;
        return true; // stop iterating
      }
      return false;
    });
    return foundWebAppDep;
  }

  private hasWebAppDeps(dependencies: Dependencies): boolean {
    for (const dep of Object.keys(dependencies)) {
      if (WEB_APP_DEPS.includes(dep)) {
        return true;
      }
    }
    return false;
  }

  private forEachWorkspaceFolderWithLockFile(
    callback: (
      dependencies: Dependencies,
      lockFilePath: string,
    ) => boolean | undefined,
  ): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      let shouldStop = false;
      for (const { name, parser } of LOCK_FILES) {
        const lockFilePath = path.join(folder.uri.fsPath, name);
        if (fs.existsSync(lockFilePath)) {
          try {
            const content = fs.readFileSync(lockFilePath, 'utf-8');
            const dependencies = parser(content);
            if (callback(dependencies, lockFilePath)) {
              shouldStop = true;
              break;
            }
          } catch (error) {
            console.error(`Error processing lock file ${lockFilePath}:`, error);
          }
        }
      }
      if (shouldStop) {
        break;
      }
    }
  }

  private compareVersions(v1: string, v2: string): number {
    return compareVersionsUtil(v1, v2);
  }
}
