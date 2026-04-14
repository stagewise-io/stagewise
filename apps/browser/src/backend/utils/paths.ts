import fs from 'node:fs/promises';
import { app } from 'electron';
import path from 'node:path';

export const getDataRoot = (): string =>
  path.join(app.getPath('userData'), 'stagewise');

export const getTempRoot = (): string =>
  path.join(app.getPath('temp'), 'stagewise');

export type DbName =
  | 'favicon'
  | 'web-data'
  | 'history'
  | 'thumbnails'
  | 'asset-cache'
  | 'file-read-cache'
  | 'processed-image-cache';

export const getDbPath = (name: DbName): string =>
  path.join(getDataRoot(), `${name}.sqlite`);

export const getAgentDbPath = (): string =>
  path.join(getDataRoot(), 'agents', 'instances.sqlite');

export const getDiffHistoryDbPath = (): string =>
  path.join(getDataRoot(), 'diff-history', 'data.sqlite');

export type JsonName =
  | 'config'
  | 'identity'
  | 'auth-session'
  | 'credentials'
  | 'preferences'
  | 'recently-opened-workspaces'
  | 'onboarding-state'
  | 'downloads-state'
  | 'window-state';

export const getJsonPath = (name: JsonName): string =>
  path.join(getDataRoot(), `${name}.json`);

export const getAgentsDir = (): string => path.join(getDataRoot(), 'agents');

export const getAgentDir = (agentId: string): string =>
  path.join(getDataRoot(), 'agents', agentId);

export const getAgentAttachmentsDir = (agentId: string): string =>
  path.join(getDataRoot(), 'agents', agentId, 'data-attachments');

export const getAgentAttachmentPath = (
  agentId: string,
  attachmentId: string,
): string =>
  path.join(getDataRoot(), 'agents', agentId, 'data-attachments', attachmentId);

export const getAgentAppsDir = (agentId: string): string =>
  path.join(getDataRoot(), 'agents', agentId, 'apps');

export const getAgentShellLogsDir = (agentId: string): string =>
  path.join(getDataRoot(), 'agents', agentId, 'shell-logs');

export const getDiffHistoryDir = (): string =>
  path.join(getDataRoot(), 'diff-history');

export const getDiffHistoryBlobsDir = (): string =>
  path.join(getDataRoot(), 'diff-history', 'data-blobs');

export const getUserDataDir = (): string =>
  path.join(getDataRoot(), 'user-data');

export const getPlansDir = (): string => path.join(getUserDataDir(), 'plans');

export const getRipgrepBasePath = (): string => path.join(getDataRoot(), 'bin');

export async function ensureDataDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(getDataRoot(), { recursive: true }),
    fs.mkdir(getTempRoot(), { recursive: true }),
    fs.mkdir(getAgentsDir(), { recursive: true }),
    fs.mkdir(getDiffHistoryDir(), { recursive: true }),
    fs.mkdir(getRipgrepBasePath(), { recursive: true }),
    fs.mkdir(getUserDataDir(), { recursive: true }),
    fs.mkdir(getPlansDir(), { recursive: true }),
  ]);
}

export const getPluginsPath = (): string => {
  if (app.isPackaged)
    return path.join(process.resourcesPath, 'bundled', 'plugins');
  return path.join(app.getAppPath(), 'bundled', 'plugins');
};

export const getBuiltinSkillsPath = (): string => {
  if (app.isPackaged)
    return path.join(process.resourcesPath, 'bundled', 'skills');
  return path.join(app.getAppPath(), 'bundled', 'skills');
};
