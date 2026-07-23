import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyPendingAppDataReset,
  requestAppDataReset,
} from './app-data-reset';

let userDataDirectory: string;
const tempDirectoryPrefix = path.join(os.tmpdir(), 'stagewise-reset-');

beforeEach(() => {
  userDataDirectory = fs.mkdtempSync(tempDirectoryPrefix);
  fs.mkdirSync(path.join(userDataDirectory, 'stagewise'));
});

afterEach(() => {
  fs.rmSync(userDataDirectory, { recursive: true, force: true });
});

describe('app data reset', () => {
  it('deletes user data while preserving identity.json', () => {
    const dataRoot = path.join(userDataDirectory, 'stagewise');
    const identityPath = path.join(dataRoot, 'identity.json');
    const identity = '{"machineId":"00000000-0000-4000-8000-000000000001"}';

    fs.mkdirSync(path.join(userDataDirectory, 'session'));
    fs.writeFileSync(identityPath, identity);
    fs.writeFileSync(path.join(dataRoot, 'preferences.json'), '{}');
    fs.writeFileSync(path.join(userDataDirectory, 'session', 'Cookies'), 'x');
    fs.writeFileSync(path.join(userDataDirectory, 'SingletonLock'), 'lock');

    requestAppDataReset(userDataDirectory);

    applyPendingAppDataReset(userDataDirectory);
    expect(fs.readFileSync(identityPath, 'utf8')).toBe(identity);
    expect(fs.existsSync(path.join(dataRoot, 'preferences.json'))).toBe(false);
    expect(fs.existsSync(path.join(userDataDirectory, 'session'))).toBe(false);
    expect(fs.existsSync(path.join(userDataDirectory, 'SingletonLock'))).toBe(
      true,
    );
  });

  it('deletes user data without an identity.json', () => {
    const dataRoot = path.join(userDataDirectory, 'stagewise');
    fs.writeFileSync(path.join(dataRoot, 'preferences.json'), '{}');
    requestAppDataReset(userDataDirectory);

    applyPendingAppDataReset(userDataDirectory);
    expect(fs.readdirSync(dataRoot)).toEqual([]);
  });
});
