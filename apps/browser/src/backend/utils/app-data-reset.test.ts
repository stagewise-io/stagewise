import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPendingAppDataReset,
  requestAppDataReset,
} from './app-data-reset';

let userDataDirectory: string;

afterEach(() => {
  fs.rmSync(userDataDirectory, { recursive: true, force: true });
});

describe('app data reset', () => {
  it('deletes user data while preserving identity.json', () => {
    userDataDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'stagewise-reset-'),
    );
    const dataRoot = path.join(userDataDirectory, 'stagewise');
    const identityPath = path.join(dataRoot, 'identity.json');
    const identity = '{"machineId":"00000000-0000-4000-8000-000000000001"}';

    fs.mkdirSync(path.join(userDataDirectory, 'session'), { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(identityPath, identity);
    fs.writeFileSync(path.join(dataRoot, 'preferences.json'), '{}');
    fs.writeFileSync(path.join(userDataDirectory, 'session', 'Cookies'), 'x');

    requestAppDataReset(userDataDirectory);

    applyPendingAppDataReset(userDataDirectory);
    expect(fs.readFileSync(identityPath, 'utf8')).toBe(identity);
    expect(fs.existsSync(path.join(dataRoot, 'preferences.json'))).toBe(false);
    expect(fs.existsSync(path.join(userDataDirectory, 'session'))).toBe(false);
  });

  it('deletes user data without an identity.json', () => {
    userDataDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'stagewise-reset-'),
    );
    requestAppDataReset(userDataDirectory);

    applyPendingAppDataReset(userDataDirectory);
    expect(fs.existsSync(userDataDirectory)).toBe(false);
  });
});
