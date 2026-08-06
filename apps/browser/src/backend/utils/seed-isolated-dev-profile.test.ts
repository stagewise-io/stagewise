import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ISOLATED_DEV_SEED_MARKER,
  seedIsolatedDevProfile,
} from './seed-isolated-dev-profile';

let root: string;
let appDataDirectory: string;
let sourceDataRoot: string;
let userDataDirectory: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stagewise-dev-seed-'));
  appDataDirectory = path.join(root, 'app-data');
  sourceDataRoot = path.join(appDataDirectory, 'stagewise-dev', 'stagewise');
  userDataDirectory = path.join(appDataDirectory, 'stagewise-dev-deadbeef');
  fs.mkdirSync(sourceDataRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('seedIsolatedDevProfile', () => {
  it('copies only allowed missing files and seeds once', () => {
    const targetDataRoot = path.join(userDataDirectory, 'stagewise');
    fs.mkdirSync(targetDataRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceDataRoot, 'auth-session.json'), 'auth');
    fs.writeFileSync(path.join(sourceDataRoot, 'preferences.json'), 'source');
    fs.writeFileSync(path.join(sourceDataRoot, 'window-state.json'), 'window');
    fs.writeFileSync(path.join(targetDataRoot, 'preferences.json'), 'target');

    expect(
      seedIsolatedDevProfile(
        appDataDirectory,
        userDataDirectory,
        'stagewise-dev-deadbeef',
      ),
    ).toBe(1);
    expect(
      fs.readFileSync(path.join(targetDataRoot, 'auth-session.json'), 'utf8'),
    ).toBe('auth');
    expect(
      fs.readFileSync(path.join(targetDataRoot, 'preferences.json'), 'utf8'),
    ).toBe('target');
    expect(fs.existsSync(path.join(targetDataRoot, 'window-state.json'))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(userDataDirectory, ISOLATED_DEV_SEED_MARKER)),
    ).toBe(true);
    expect(
      seedIsolatedDevProfile(
        appDataDirectory,
        userDataDirectory,
        'stagewise-dev-deadbeef',
      ),
    ).toBe(0);
  });

  it('does not seed the default dev profile', () => {
    expect(
      seedIsolatedDevProfile(
        appDataDirectory,
        userDataDirectory,
        'stagewise-dev',
      ),
    ).toBe(0);
  });
});
