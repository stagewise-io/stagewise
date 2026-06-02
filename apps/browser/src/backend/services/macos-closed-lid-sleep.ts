import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';
import { DisposableService } from './disposable';
import type { KartonService } from './karton';
import type { Logger } from './logger';

const execFileAsync = promisify(execFile);

const PMSET_PATH = '/usr/bin/pmset';
const OSASCRIPT_PATH = '/usr/bin/osascript';
const SUDO_PATH = '/usr/bin/sudo';
const SUDOERS_RULE_PATH = '/etc/sudoers.d/stagewise-closed-lid-sleep';
const SUDOERS_TEMP_RULE_PATH = '/tmp/stagewise-closed-lid-sleep-sudoers';
const STATUS_REFRESH_INTERVAL_MS = 5_000;

type ClosedLidSleepState = {
  isSupported: boolean;
  isSleepDisabled: boolean;
  ownedByStagewise: boolean;
  isChanging: boolean;
  error: string | null;
};

function parseDisableSleepState(output: string): boolean | null {
  const match = output.match(
    /^\s*(?:disablesleep|SleepDisabled)\s+(\d+)\s*$/im,
  );
  if (!match) return null;
  return match[1] === '1';
}

async function readDisableSleepState(): Promise<boolean> {
  const currentResult = await execFileAsync(PMSET_PATH, ['-g']);
  const currentState = parseDisableSleepState(currentResult.stdout);
  if (currentState !== null) return currentState;

  const customResult = await execFileAsync(PMSET_PATH, ['-g', 'custom']);
  const customState = parseDisableSleepState(customResult.stdout);
  return customState ?? false;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function escapeSudoersUser(value: string): string {
  return value.replaceAll(/([\\,:=\s])/g, '\\$1');
}

function getSudoersRule(): string {
  const user = escapeSudoersUser(userInfo().username);
  return `${user} ALL=(root) NOPASSWD: ${PMSET_PATH} -a disablesleep 1, ${PMSET_PATH} -a disablesleep 0\n`;
}

async function runPasswordlessPmset(disabled: boolean): Promise<void> {
  await execFileAsync(SUDO_PATH, [
    '-n',
    PMSET_PATH,
    '-a',
    'disablesleep',
    disabled ? '1' : '0',
  ]);
}

async function installPasswordlessPmsetRule(): Promise<void> {
  const rule = getSudoersRule();
  const command = [
    '/bin/mkdir -p /etc/sudoers.d',
    `/usr/bin/printf %s ${shellQuote(rule)} > ${shellQuote(SUDOERS_TEMP_RULE_PATH)}`,
    `/usr/sbin/chown root:wheel ${shellQuote(SUDOERS_TEMP_RULE_PATH)}`,
    `/bin/chmod 0440 ${shellQuote(SUDOERS_TEMP_RULE_PATH)}`,
    `/usr/sbin/visudo -cf ${shellQuote(SUDOERS_TEMP_RULE_PATH)}`,
    `/bin/mv ${shellQuote(SUDOERS_TEMP_RULE_PATH)} ${shellQuote(SUDOERS_RULE_PATH)}`,
    `/usr/sbin/visudo -cf /etc/sudoers`,
  ].join(' && ');

  await execFileAsync(OSASCRIPT_PATH, [
    '-e',
    `do shell script ${JSON.stringify(command)} with prompt ${JSON.stringify(
      'stagewise wants to install a restricted sudoers rule so it can toggle closed-lid sleep without asking every time.',
    )} with administrator privileges`,
  ]);
}

async function setDisableSleepState(disabled: boolean): Promise<void> {
  try {
    await runPasswordlessPmset(disabled);
  } catch {
    await installPasswordlessPmsetRule();
    await runPasswordlessPmset(disabled);
  }
}

export class MacOSClosedLidSleepService extends DisposableService {
  private ownedByStagewise = false;
  private previousDisabledState: boolean | null = null;
  private isChanging = false;
  private error: string | null = null;
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncingState = false;
  private shouldSyncAgain = false;

  private constructor(
    private readonly logger: Logger,
    private readonly uiKarton: KartonService,
  ) {
    super();
  }

  public static create(
    logger: Logger,
    uiKarton: KartonService,
  ): MacOSClosedLidSleepService {
    const instance = new MacOSClosedLidSleepService(logger, uiKarton);
    instance.initialize();
    return instance;
  }

  private initialize(): void {
    this.syncState().catch((error) => {
      this.logger.warn(
        '[MacOSClosedLidSleepService] Failed to read initial state',
        error,
      );
    });

    this.statusInterval = setInterval(() => {
      this.syncState().catch((error) => {
        this.logger.debug(
          '[MacOSClosedLidSleepService] Failed to refresh state',
          error,
        );
      });
    }, STATUS_REFRESH_INTERVAL_MS);
    this.statusInterval.unref?.();

    process.once('exit', () => {
      // Best effort only. Async work cannot run during `exit`, but keep this as
      // a final synchronous intent marker for future hardening.
      if (this.ownedByStagewise) {
        this.logger.warn(
          '[MacOSClosedLidSleepService] Process exiting while closed-lid sleep prevention is still active',
        );
      }
    });
  }

  public async toggle(): Promise<ClosedLidSleepState> {
    this.assertNotDisposed();
    if (process.platform !== 'darwin') return this.getUnsupportedState();
    if (this.isChanging) return this.getCurrentStateSnapshot();

    const isCurrentlyDisabled = await readDisableSleepState();
    return isCurrentlyDisabled ? this.enableSleep() : this.preventSleep();
  }

  public async refresh(): Promise<ClosedLidSleepState> {
    this.assertNotDisposed();
    await this.syncState();
    return this.getCurrentStateSnapshot();
  }

  private async preventSleep(): Promise<ClosedLidSleepState> {
    this.isChanging = true;
    this.error = null;
    this.publishState(false);

    try {
      const wasDisabled = await readDisableSleepState();
      this.previousDisabledState = wasDisabled;

      if (!wasDisabled) {
        await setDisableSleepState(true);
      }

      this.ownedByStagewise = !wasDisabled;
      await this.syncState();
      this.logger.info(
        `[MacOSClosedLidSleepService] Closed-lid sleep prevention enabled. ownedByStagewise=${this.ownedByStagewise}`,
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        '[MacOSClosedLidSleepService] Failed to enable closed-lid sleep prevention',
        error,
      );
      this.publishState(false);
    } finally {
      this.isChanging = false;
      await this.syncState().catch(() => this.publishState(false));
    }

    return this.getCurrentStateSnapshot();
  }

  private async enableSleep(): Promise<ClosedLidSleepState> {
    this.isChanging = true;
    this.error = null;
    this.publishState(true);

    try {
      const isSleepDisabled = await readDisableSleepState();
      if (isSleepDisabled) {
        await setDisableSleepState(false);
      }

      this.ownedByStagewise = false;
      this.previousDisabledState = null;
      await this.syncState();
      this.logger.info(
        '[MacOSClosedLidSleepService] Closed-lid sleep re-enabled',
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        '[MacOSClosedLidSleepService] Failed to re-enable closed-lid sleep',
        error,
      );
      this.publishState(true);
    } finally {
      this.isChanging = false;
      await this.syncState().catch(() => this.publishState(true));
    }

    return this.getCurrentStateSnapshot();
  }

  private async syncState(): Promise<void> {
    if (this.isSyncingState) {
      this.shouldSyncAgain = true;
      return;
    }

    this.isSyncingState = true;

    try {
      do {
        this.shouldSyncAgain = false;

        if (process.platform !== 'darwin') {
          this.publishState(false);
          continue;
        }

        const isSleepDisabled = await readDisableSleepState();
        if (!isSleepDisabled) {
          this.ownedByStagewise = false;
          this.previousDisabledState = null;
        }
        this.publishState(isSleepDisabled);
      } while (this.shouldSyncAgain);
    } finally {
      this.isSyncingState = false;
    }
  }

  private publishState(isSleepDisabled: boolean): void {
    const state: ClosedLidSleepState = {
      isSupported: process.platform === 'darwin',
      isSleepDisabled,
      ownedByStagewise: this.ownedByStagewise,
      isChanging: this.isChanging,
      error: this.error,
    };

    this.uiKarton.setState((draft) => {
      draft.closedLidSleep = state;
    });
  }

  private getCurrentStateSnapshot(): ClosedLidSleepState {
    return this.uiKarton.state.closedLidSleep;
  }

  private getUnsupportedState(): ClosedLidSleepState {
    return {
      isSupported: false,
      isSleepDisabled: false,
      ownedByStagewise: false,
      isChanging: false,
      error: null,
    };
  }

  protected async onTeardown(): Promise<void> {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    if (
      process.platform === 'darwin' &&
      this.ownedByStagewise &&
      this.previousDisabledState === false
    ) {
      try {
        await setDisableSleepState(false);
      } catch (error) {
        this.logger.warn(
          '[MacOSClosedLidSleepService] Failed to re-enable closed-lid sleep during teardown',
          error,
        );
      }
    }
  }
}
