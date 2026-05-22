import * as pty from 'node-pty';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Terminal as IHeadlessTerminal } from '@xterm/headless';
import xtermHeadless from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import { DisposableService } from '@/services/disposable';

// @xterm/headless ships as CJS in Electron's backend bundle.
// Use default import at runtime, type-only import for the instance shape.
const HeadlessTerminal = xtermHeadless.Terminal as new (options: {
  cols: number;
  rows: number;
  scrollback: number;
  allowProposedApi: boolean;
  theme?: {
    background?: string;
  };
}) => IHeadlessTerminal;
import type { Logger } from '@/services/logger';
import type { KartonService } from '@/services/karton';
import type { DetectedShell } from '@/services/toolbox/services/shell/types';
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from '@/services/toolbox/services/shell/types';
import { getTerminalTabDefaults } from '@shared/karton-contracts/ui';

/**
 * Lightweight session record for a user-controlled terminal tab.
 */
interface UserTerminalSession {
  id: string;
  pty: pty.IPty;
  /** Partial OSC escape sequence carried over from the previous
   *  data chunk. OSC sequences can span multiple onData calls. */
  oscBuffer: string;
  /** Backend-owned terminal presentation model. */
  headless: IHeadlessTerminal;
  serializeAddon: SerializeAddon;
  /** Resolves when all output written to the headless terminal has
   *  been parsed. Snapshots must await this to avoid claiming an
   *  endOffset that the presentation model has not rendered yet. */
  headlessReady: Promise<void>;
  lastMetadataRefreshAt: number;
}

type TerminalProcessInfo = {
  pid: number;
  parentPid: number;
  command: string;
  state: string;
};

/** Maximum size of the output buffer before the oldest half is
 *  trimmed. Prevents unbounded Karton state growth. */
const MAX_OUTPUT_BUFFER = 128 * 1024; // 128 KB

/** Regex matching an OSC title sequence (ESC ] Pn ; <title> BEL | ST)
 *  where Pn is 0 (icon+title), 1 (icon), or 2 (title).
 *  Non-empty titles in group 1 are extracted; group 2 captures the
 *  numeric parameter for validation. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
const OSC_TITLE_RE = /^\x1b\]([012]);([^\x07\x1b]*?)(\x07|\x1b\\)/;

/** Regex matching OSC 7 cwd updates: ESC ] 7 ; file://host/path BEL | ST. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
const OSC_CWD_RE = /^\x1b\]7;(file:\/\/[^\x07\x1b]*?)(\x07|\x1b\\)/;

/** Regex matching OSC 11 background color queries: ESC ] 11 ; ? BEL | ST. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
const OSC_BACKGROUND_QUERY_RE = /^\x1b\]11;\?(\x07|\x1b\\)/;

const TERMINAL_BACKGROUND_BY_THEME = {
  light: '#fdfcfc',
  dark: '#1e1e1d',
} as const;

const MAX_PARTIAL_OSC_LENGTH = 4096;

function cwdFromOsc7Uri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:') return null;
    if (process.platform === 'win32') {
      return fileURLToPath(parsed) || null;
    }
    return decodeURIComponent(parsed.pathname) || null;
  } catch {
    return null;
  }
}

function hexColorToOscRgb(color: string): string {
  const normalized = color.replace(/^#/, '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => part + part)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return 'rgb:0000/0000/0000';
  }

  const r = expanded.slice(0, 2);
  const g = expanded.slice(2, 4);
  const b = expanded.slice(4, 6);
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}

function buildOsc11Response(background: string): string {
  return `\x1b]11;${hexColorToOscRgb(background)}\x07`;
}

function isPartialOscSequence(tail: string): boolean {
  const startsOsc = tail.startsWith('\x1b]');
  const hasTerminatingBel = tail.includes('\x07');
  const hasTerminatingSt = tail.includes('\x1b\\');

  return (
    (startsOsc && !hasTerminatingBel && !hasTerminatingSt) ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
    /^\x1b\]([012]);([^\x07\x1b]*)$/.test(tail) ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
    /^\x1b\]7;(file:\/\/[^\x07\x1b]*)$/.test(tail) ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
    /^\x1b\]11;\??$/.test(tail) ||
    tail === '\x1b' ||
    tail === '\x1b]' ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal ESC sequences
    /^\x1b\]([012]|7|11)$/.test(tail)
  );
}

function commandName(command: string): string {
  const normalized = command.replace(/\/$/, '');
  return normalized.split('/').pop() || normalized;
}

function readProcessList(): TerminalProcessInfo[] {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return [];
  }

  try {
    const output = execFileSync('ps', ['-axo', 'pid=,ppid=,stat=,comm='], {
      encoding: 'utf8',
      timeout: 500,
    });

    return output
      .split('\n')
      .map((line): TerminalProcessInfo | null => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
        if (!match) return null;
        return {
          pid: Number.parseInt(match[1]!, 10),
          parentPid: Number.parseInt(match[2]!, 10),
          state: match[3]!,
          command: commandName(match[4]!),
        };
      })
      .filter((entry): entry is TerminalProcessInfo => Boolean(entry));
  } catch {
    return [];
  }
}

function findForegroundProcess(shellPid: number): TerminalProcessInfo | null {
  const processes = readProcessList();
  if (processes.length === 0) return null;

  const childrenByParent = new Map<number, TerminalProcessInfo[]>();
  for (const processInfo of processes) {
    const children = childrenByParent.get(processInfo.parentPid) ?? [];
    children.push(processInfo);
    childrenByParent.set(processInfo.parentPid, children);
  }

  const directChildren = childrenByParent.get(shellPid) ?? [];
  return (
    directChildren
      .filter((child) => !child.state.includes('Z'))
      .sort((a, b) => b.pid - a.pid)[0] ?? null
  );
}

/**
 * Process raw PTY data through the OSC pipeline:
 *  - Strips complete OSC 0/1/2 title sequences from the output.
 *  - Strips complete OSC 7 cwd sequences from the output.
 *  - Responds to OSC 11 background color queries from terminal apps.
 *  - Calls callbacks for extracted title/cwd metadata.
 *  - Returns clean output and a carried-over partial-sequence buffer.
 */
function processOscData(
  chunk: string,
  prevOscBuffer: string,
  onTitle: (title: string) => void,
  onCwd: (cwd: string) => void,
  onBackgroundQuery: () => void,
): { output: string; oscBuffer: string } {
  let combined = prevOscBuffer + chunk;
  let output = '';

  while (combined.length > 0) {
    const escIdx = combined.indexOf('\x1b');
    if (escIdx === -1) {
      output += combined;
      return { output, oscBuffer: '' };
    }

    output += combined.slice(0, escIdx);
    const tail = combined.slice(escIdx);

    const titleMatch = OSC_TITLE_RE.exec(tail);
    if (titleMatch) {
      const title = titleMatch[2];
      if (title) onTitle(title);
      combined = tail.slice(titleMatch[0].length);
      continue;
    }

    const cwdMatch = OSC_CWD_RE.exec(tail);
    if (cwdMatch) {
      const cwd = cwdFromOsc7Uri(cwdMatch[1]);
      if (cwd) onCwd(cwd);
      combined = tail.slice(cwdMatch[0].length);
      continue;
    }

    const backgroundQueryMatch = OSC_BACKGROUND_QUERY_RE.exec(tail);
    if (backgroundQueryMatch) {
      onBackgroundQuery();
      combined = tail.slice(backgroundQueryMatch[0].length);
      continue;
    }

    if (isPartialOscSequence(tail)) {
      if (tail.length <= MAX_PARTIAL_OSC_LENGTH) {
        return { output, oscBuffer: tail };
      }

      // Treat oversized unterminated OSC sequences as malformed.
      // Otherwise a broken prefix can keep absorbing later normal PTY
      // bytes into oscBuffer and suppress all terminal rendering.
      return { output, oscBuffer: '' };
    }

    const nextEsc = tail.indexOf('\x1b', 1);
    if (nextEsc === -1) {
      output += tail;
      return { output, oscBuffer: '' };
    }
    output += tail.slice(0, nextEsc);
    combined = tail.slice(nextEsc);
  }

  return { output, oscBuffer: '' };
}

/**
 * Manages user-controllable terminal PTYs.
 *
 * Terminal tabs live in `contentTabs.tabs` with `type: 'terminal'`.
 * PTY output is buffered in `terminals.outputBuffers` (AppState root)
 * so the UI's xterm can consume it incrementally.  The buffer survives
 * agent switches and UI unmount/remount cycles within the same window
 * because Karton state is window-scoped.
 */
export class TerminalService extends DisposableService {
  private readonly logger: Logger;
  private readonly uiKarton: KartonService;
  private readonly shell: DetectedShell;
  private readonly resolvedEnv: Record<string, string>;
  private readonly sessions = new Map<string, UserTerminalSession>();
  private terminalCounter = 0;
  /** Local mirror of output buffers, keyed by terminalId.  Needed
   *  for the FIFO trim — Karton state reads can be stale due to
   *  batching, so we track buffer length independently. */
  private readonly outputBuffers = new Map<string, string>();
  /** Monotonic absolute offsets for outputBuffers. */
  private readonly outputBaseOffsets = new Map<string, number>();
  private readonly outputEndOffsets = new Map<string, number>();
  /** Set during teardown so onPtyExit knows to skip state mutations
   *  — the persisted tab state must survive app shutdown unchanged. */
  private tearingDown = false;
  /** Fired after a terminal tab is inserted into contentTabs so
   *  WindowLayoutService can activate it properly. */
  private onTerminalTabCreated: ((terminalId: string) => void) | null = null;
  /** Fired after a terminal tab is removed from contentTabs (PTY
   *  exit) so WindowLayoutService can handle active-tab selection. */
  private onTerminalTabRemoved: ((terminalId: string) => void) | null = null;

  public setOnTerminalTabCreated(fn: (terminalId: string) => void): void {
    this.onTerminalTabCreated = fn;
  }
  public setOnTerminalTabRemoved(fn: (terminalId: string) => void): void {
    this.onTerminalTabRemoved = fn;
  }

  /** Best-effort sync of live PTY working directories into Karton state.
   *  Terminals can `cd` after creation; persisting only the initial cwd
   *  makes restored terminals restart in the wrong directory. */
  public syncTerminalCwds(): void {
    for (const [terminalId, session] of this.sessions) {
      const cwd = this.readProcessCwd(session.pty.pid);
      if (!cwd) continue;
      const tab = this.uiKarton.state.contentTabs.tabs[terminalId];
      if (tab?.type !== 'terminal' || tab.cwd === cwd) continue;
      this.uiKarton.setState((draft) => {
        const draftTab = draft.contentTabs.tabs[terminalId];
        if (draftTab?.type === 'terminal') draftTab.cwd = cwd;
      });
    }
  }

  constructor(
    logger: Logger,
    uiKarton: KartonService,
    shell: DetectedShell,
    resolvedEnv: Record<string, string> | null | undefined,
  ) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    this.shell = shell;
    this.resolvedEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    if (resolvedEnv) {
      Object.assign(this.resolvedEnv, resolvedEnv);
    }
  }

  // ─── Initialisation ──────────────────────────────────────────

  initialize(): void {
    this.registerProcedures();
    this.seedCounterFromState();
    this.logger.info('[TerminalService] Initialised');
  }

  /** Restore a single terminal tab by spawning a PTY if one doesn't
   *  already exist. Used for deferred (lazy) terminal tab restoration
   *  when switching to an agent whose terminals were not eagerly loaded. */
  public restoreTerminal(terminalId: string, cwd: string): void {
    if (this.sessions.has(terminalId)) return;
    this.outputBuffers.delete(terminalId);
    this.uiKarton.setState((draft) => {
      delete draft.terminals.outputBuffers[terminalId];
      delete draft.terminals.outputBufferOffsets[terminalId];
    });
    const actualCwd = this.createPty(terminalId, cwd);
    if (!actualCwd) return;
    this.uiKarton.setState((draft) => {
      const tab = draft.contentTabs.tabs[terminalId];
      if (tab?.type === 'terminal') tab.cwd = actualCwd;
    });
    this.updateTerminalMetadata(terminalId, true);
  }

  /** Scan persisted terminal tabs in contentTabs and spawn PTYs for
   *  any that don't already have a session (post-restart rehydration).
   *  Called by ToolboxService after WindowLayoutService has loaded tab
   *  state.  Clears any stale output buffer so the UI starts with a
   *  blank terminal on remount. */
  restoreFromState(): void {
    const tabs = this.uiKarton.state.contentTabs.tabs;
    for (const id of Object.keys(tabs)) {
      const tab = tabs[id];
      if (!tab || tab.type !== 'terminal') continue;
      if (this.sessions.has(id)) continue;
      // Wipe any stale buffer carried over from a previous session —
      // the new PTY starts clean.  The UI will replay nothing.
      this.outputBuffers.delete(id);
      this.uiKarton.setState((draft) => {
        delete draft.terminals.outputBuffers[id];
        delete draft.terminals.outputBufferOffsets[id];
      });
      // tab.cwd is always set (required field), but guard against
      // empty-string edge case from legacy persisted state.
      const actualCwd = this.createPty(id, tab.cwd);
      if (!actualCwd) continue;
      this.uiKarton.setState((draft) => {
        const restoredTab = draft.contentTabs.tabs[id];
        if (restoredTab?.type === 'terminal') restoredTab.cwd = actualCwd;
      });
      this.updateTerminalMetadata(id, true);
    }
  }

  /** Parse existing terminal tab IDs to set terminalCounter above them. */
  private seedCounterFromState(): void {
    const tabs = this.uiKarton.state.contentTabs.tabs;
    let maxCounter = 0;
    for (const id of Object.keys(tabs)) {
      const match = /^term-(\d+)$/.exec(id);
      if (match) {
        const n = Number.parseInt(match[1]!, 10);
        if (n > maxCounter) maxCounter = n;
      }
    }
    if (maxCounter > this.terminalCounter) {
      this.terminalCounter = maxCounter;
    }
  }

  // ─── Karton procedure registration ───────────────────────────

  private registerProcedures(): void {
    this.uiKarton.registerServerProcedureHandler(
      'browser.createTerminal',
      async (
        _callingClientId: string,
        cwd?: string,
        agentInstanceId?: string | null,
      ) => {
        await this.handleCreateTerminal(cwd, agentInstanceId);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'browser.terminalInput',
      async (_callingClientId: string, terminalId: string, data: string) => {
        this.handleTerminalInput(terminalId, data);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'browser.terminalResize',
      async (
        _callingClientId: string,
        terminalId: string,
        cols: number,
        rows: number,
      ) => {
        this.handleTerminalResize(terminalId, cols, rows);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'browser.getTerminalSnapshot',
      async (_callingClientId: string, terminalId: string) => {
        return this.handleGetTerminalSnapshot(terminalId);
      },
    );
  }

  // ─── Handlers ────────────────────────────────────────────────

  private async handleGetTerminalSnapshot(terminalId: string): Promise<{
    state: string | null;
    baseOffset: number;
    endOffset: number;
    cols: number;
    rows: number;
  }> {
    const session = this.sessions.get(terminalId);

    if (!session) {
      return {
        state: null,
        baseOffset: 0,
        endOffset: 0,
        cols: DEFAULT_TERMINAL_COLS,
        rows: DEFAULT_TERMINAL_ROWS,
      };
    }

    try {
      await session.headlessReady;
      // Capture offsets AFTER headless is ready — queued onData writes
      // between the await and serialize() would otherwise advance the
      // buffer past the captured endOffset, causing the renderer to
      // replay bytes that are already in the serialized snapshot.
      const baseOffset = this.outputBaseOffsets.get(terminalId) ?? 0;
      const endOffset = this.outputEndOffsets.get(terminalId) ?? baseOffset;
      return {
        state: session.serializeAddon.serialize({ scrollback: 5000 }),
        baseOffset,
        endOffset,
        cols: session.headless.cols,
        rows: session.headless.rows,
      };
    } catch (error) {
      this.logger.warn(
        `[TerminalService] Failed to serialize terminal ${terminalId}`,
        error,
      );
      return {
        state: null,
        baseOffset: 0,
        endOffset: 0,
        cols: session.headless.cols,
        rows: session.headless.rows,
      };
    }
  }

  private async handleCreateTerminal(
    cwd?: string,
    agentInstanceId?: string | null,
  ): Promise<void> {
    if (this.disposed) return;

    const resolvedCwd = cwd ?? this.resolveDefaultCwd(agentInstanceId);
    this.terminalCounter++;
    const terminalId = `term-${this.terminalCounter}`;
    const title = this.shell?.type
      ? this.shell.type.charAt(0).toUpperCase() + this.shell.type.slice(1)
      : 'Terminal';
    const createdAt = Date.now();

    const actualCwd = this.createPty(terminalId, resolvedCwd);
    if (!actualCwd) return;

    // Insert the tab into contentTabs but do NOT set activeTabId here.
    // WindowLayoutService owns all active-tab transitions — it needs to
    // hide the previous Electron WebContentsView and update its internal
    // this.activeTabId.  We fire onTerminalTabCreated so it can call
    // handleSwitchTab(terminalId) through the proper path.
    this.uiKarton.setState((draft) => {
      const tabAgentInstanceId = agentInstanceId ?? null;
      draft.contentTabs.tabs[terminalId] = {
        ...getTerminalTabDefaults(),
        id: terminalId,
        title,
        agentInstanceId: tabAgentInstanceId,
        cwd: actualCwd,
        createdAt,
        lastFocusedAt: createdAt,
      };
      if (tabAgentInstanceId) {
        draft.contentTabs.agentOrders[tabAgentInstanceId] ??= [];
        const order = draft.contentTabs.agentOrders[tabAgentInstanceId];
        if (!order.includes(terminalId)) order.push(terminalId);
      } else if (!draft.contentTabs.globalOrder.includes(terminalId)) {
        draft.contentTabs.globalOrder.push(terminalId);
      }
    });
    this.updateTerminalMetadata(terminalId, true);
    this.onTerminalTabCreated?.(terminalId);

    this.logger.info(
      `[TerminalService] Created terminal ${terminalId} in ${actualCwd}`,
    );
  }

  /** Compute the default CWD for a new terminal:
   *  - If the current agent has mounted workspaces, use the first one.
   *  - Otherwise, fall back to the user's home directory. */
  private resolveDefaultCwd(agentInstanceId?: string | null): string {
    if (agentInstanceId) {
      const mounts =
        this.uiKarton.state.toolbox[agentInstanceId]?.workspace?.mounts;
      if (mounts && mounts.length > 0 && mounts[0]?.path) {
        return mounts[0].path;
      }
    }
    return this.getUserHomeDirectory() ?? process.cwd();
  }

  private getUserHomeDirectory(): string | undefined {
    if (process.platform === 'win32') {
      return process.env.USERPROFILE ?? process.env.HOME;
    }
    return process.env.HOME ?? process.env.USERPROFILE;
  }

  private readProcessCwd(pid: number): string | null {
    if (process.platform === 'linux') {
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        return cwd || null;
      } catch {
        return null;
      }
    }

    if (process.platform === 'darwin') {
      try {
        // macOS has no /proc. lsof exposes the cwd file descriptor as
        // a portable fallback. `-Fn` prints machine-readable `n/path`
        // records, avoiding brittle column parsing.
        const output = execFileSync(
          'lsof',
          ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
          { encoding: 'utf8', timeout: 1000 },
        );
        const cwdLine = output.split('\n').find((line) => line.startsWith('n'));
        return cwdLine ? cwdLine.slice(1) || null : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  private getTerminalBackgroundColor(): string {
    const theme = this.uiKarton.state.systemTheme;
    return TERMINAL_BACKGROUND_BY_THEME[theme];
  }

  private updateTerminalMetadata(terminalId: string, force = false): void {
    const session = this.sessions.get(terminalId);
    if (!session) return;

    const now = Date.now();
    if (!force && now - session.lastMetadataRefreshAt < 1000) return;
    session.lastMetadataRefreshAt = now;

    const runningProcess = findForegroundProcess(session.pty.pid);
    const cwd = this.readProcessCwd(runningProcess?.pid ?? session.pty.pid);

    this.uiKarton.setState((draft) => {
      const tab = draft.contentTabs.tabs[terminalId];
      if (!tab || tab.type !== 'terminal') return;
      if (cwd) tab.cwd = cwd;
      tab.terminalRunningProcess = runningProcess?.command ?? null;
    });
  }

  private isUsableDirectory(path: string): boolean {
    try {
      return fs.statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  private resolveSafePtyCwd(requestedCwd: string): string {
    const candidates = [
      requestedCwd,
      this.getUserHomeDirectory(),
      process.cwd(),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (this.isUsableDirectory(candidate)) return candidate;
    }

    return process.cwd();
  }

  /** Spawn a PTY and wire up onData / onExit for an existing terminal
   *  tab.  Shared by handleCreateTerminal and restoreFromState.
   *  Guards against empty, stale, or deleted cwd values — node-pty can
   *  throw when cwd is invalid, which must not abort terminal creation. */
  private createPty(terminalId: string, cwd: string): string | null {
    const requestedCwd = cwd || this.getUserHomeDirectory() || process.cwd();
    const resolvedCwd = this.resolveSafePtyCwd(requestedCwd);
    const spawnArgs: string[] =
      this.shell.type === 'powershell' ? ['-NoExit'] : ['-i'];
    if (this.shell.type === 'bash') {
      spawnArgs.push('--norc');
    }

    const spawnAtCwd = (spawnCwd: string) =>
      pty.spawn(this.shell.path, spawnArgs, {
        name: 'xterm-256color',
        cols: DEFAULT_TERMINAL_COLS,
        rows: DEFAULT_TERMINAL_ROWS,
        cwd: spawnCwd,
        env: {
          ...this.resolvedEnv,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

    if (resolvedCwd !== requestedCwd) {
      this.logger.warn(
        `[TerminalService] Falling back from unavailable cwd ${requestedCwd} to ${resolvedCwd}`,
      );
    }

    let ptyProcess: pty.IPty;
    let actualCwd = resolvedCwd;
    try {
      ptyProcess = spawnAtCwd(resolvedCwd);
    } catch (error) {
      const fallbackCwd = this.resolveSafePtyCwd(
        this.getUserHomeDirectory() || process.cwd(),
      );
      if (fallbackCwd === resolvedCwd) {
        this.logger.error(
          `[TerminalService] Failed to spawn terminal ${terminalId} in ${resolvedCwd}`,
          error,
        );
        return null;
      }

      this.logger.warn(
        `[TerminalService] Failed to spawn terminal ${terminalId} in ${resolvedCwd}; retrying in ${fallbackCwd}`,
        error,
      );

      try {
        ptyProcess = spawnAtCwd(fallbackCwd);
        actualCwd = fallbackCwd;
      } catch (fallbackError) {
        this.logger.error(
          `[TerminalService] Failed to spawn terminal ${terminalId} in fallback cwd ${fallbackCwd}`,
          fallbackError,
        );
        return null;
      }
    }

    const headless = new HeadlessTerminal({
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: this.getTerminalBackgroundColor(),
      },
    });
    const serializeAddon = new SerializeAddon();
    headless.loadAddon(serializeAddon);

    const session: UserTerminalSession = {
      id: terminalId,
      pty: ptyProcess,
      oscBuffer: '',
      headless,
      serializeAddon,
      headlessReady: Promise.resolve(),
      lastMetadataRefreshAt: 0,
    };

    this.sessions.set(terminalId, session);

    ptyProcess.onData((data: string) => {
      const curSession = this.sessions.get(terminalId);
      if (!curSession || this.disposed) return;

      this.updateTerminalMetadata(terminalId);

      const { output, oscBuffer } = processOscData(
        data,
        curSession.oscBuffer,
        (title) => {
          this.uiKarton.setState((draft) => {
            const tab = draft.contentTabs.tabs[terminalId];
            if (tab && tab.type === 'terminal') {
              tab.title = title;
            }
          });
        },
        (cwd) => {
          this.uiKarton.setState((draft) => {
            const tab = draft.contentTabs.tabs[terminalId];
            if (tab && tab.type === 'terminal') {
              tab.cwd = cwd;
            }
          });
        },
        () => {
          curSession.pty.write(
            buildOsc11Response(this.getTerminalBackgroundColor()),
          );
        },
      );

      curSession.oscBuffer = oscBuffer;

      if (output.length > 0) {
        curSession.headlessReady = curSession.headlessReady.then(
          () =>
            new Promise<void>((resolve) => {
              curSession.headless.write(output, resolve);
            }),
        );

        const prev = this.outputBuffers.get(terminalId) ?? '';
        const previousEndOffset =
          this.outputEndOffsets.get(terminalId) ??
          (this.outputBaseOffsets.get(terminalId) ?? 0) + prev.length;
        let baseOffset = this.outputBaseOffsets.get(terminalId) ?? 0;
        let buf = prev + output;
        const endOffset = previousEndOffset + output.length;

        if (buf.length > MAX_OUTPUT_BUFFER) {
          const keepLength = MAX_OUTPUT_BUFFER / 2;
          const trimLength = buf.length - keepLength;
          buf = buf.slice(-keepLength);
          baseOffset += trimLength;
        }

        this.outputBuffers.set(terminalId, buf);
        this.outputBaseOffsets.set(terminalId, baseOffset);
        this.outputEndOffsets.set(terminalId, endOffset);

        this.uiKarton.setState((draft) => {
          draft.terminals.outputBuffers[terminalId] = buf;
          draft.terminals.outputBufferOffsets[terminalId] = {
            baseOffset,
            endOffset,
          };
        });
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.logger.info(
        `[TerminalService] PTY ${terminalId} exited with code ${exitCode}`,
      );
      this.onPtyExit(terminalId);
    });

    return actualCwd;
  }

  /** Kill the PTY and clean up session state. */
  public handleCloseTerminal(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      this.logger.warn(
        `[TerminalService] closeTerminal: unknown terminal ${terminalId}`,
      );
      return;
    }

    try {
      session.pty.kill();
    } catch (err) {
      this.logger.warn(
        `[TerminalService] Error killing PTY ${terminalId}`,
        err,
      );
    }

    session.headless.dispose();
    this.sessions.delete(terminalId);
    this.outputBuffers.delete(terminalId);
    this.outputBaseOffsets.delete(terminalId);
    this.outputEndOffsets.delete(terminalId);

    // Only remove the tab from Karton state and clean up PTY resources.
    // Active-tab selection is NOT our concern — the caller
    // (WindowLayoutService.handleCloseTab) picks the next tab and calls
    // handleSwitchTab after we return.  This keeps all active-tab logic
    // centralized in one service.
    this.uiKarton.setState((draft) => {
      delete draft.contentTabs.tabs[terminalId];
      draft.contentTabs.globalOrder = draft.contentTabs.globalOrder.filter(
        (id) => id !== terminalId,
      );
      for (const agentId of Object.keys(draft.contentTabs.agentOrders)) {
        draft.contentTabs.agentOrders[agentId] = draft.contentTabs.agentOrders[
          agentId
        ]!.filter((id) => id !== terminalId);
        if (draft.contentTabs.agentOrders[agentId]!.length === 0) {
          delete draft.contentTabs.agentOrders[agentId];
        }
      }
      delete draft.terminals.outputBuffers[terminalId];
      delete draft.terminals.outputBufferOffsets[terminalId];
    });

    this.logger.info(`[TerminalService] Closed terminal ${terminalId}`);
  }

  /** Shared PTY-exit handler for both new and restored terminals. */
  private onPtyExit(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) return;
    session.headless.dispose();
    this.sessions.delete(terminalId);
    this.outputBuffers.delete(terminalId);
    this.outputBaseOffsets.delete(terminalId);
    this.outputEndOffsets.delete(terminalId);

    if (this.tearingDown) return;

    this.uiKarton.setState((draft) => {
      delete draft.contentTabs.tabs[terminalId];
      draft.contentTabs.globalOrder = draft.contentTabs.globalOrder.filter(
        (id) => id !== terminalId,
      );
      for (const agentId of Object.keys(draft.contentTabs.agentOrders)) {
        draft.contentTabs.agentOrders[agentId] = draft.contentTabs.agentOrders[
          agentId
        ]!.filter((id) => id !== terminalId);
        if (draft.contentTabs.agentOrders[agentId]!.length === 0) {
          delete draft.contentTabs.agentOrders[agentId];
        }
      }
      delete draft.terminals.outputBuffers[terminalId];
      delete draft.terminals.outputBufferOffsets[terminalId];
    });

    // The PTY exited asynchronously — WindowLayoutService had no part
    // in this.  Fire onTerminalTabRemoved so it can pick a new active
    // tab (via handleTerminalTabExited) and persist the changed state.
    // We must NOT set activeTabId ourselves — that would bypass the
    // Electron view management in handleSwitchTab.
    this.onTerminalTabRemoved?.(terminalId);
  }

  private handleTerminalInput(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      this.logger.warn(
        `[TerminalService] terminalInput: unknown terminal ${terminalId}`,
      );
      return;
    }
    try {
      session.pty.write(data);
    } catch (err) {
      this.logger.warn(
        `[TerminalService] Error writing to PTY ${terminalId}`,
        err,
      );
    }
  }

  private handleTerminalResize(
    terminalId: string,
    cols: number,
    rows: number,
  ): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      this.logger.warn(
        `[TerminalService] terminalResize: unknown terminal ${terminalId}`,
      );
      return;
    }
    try {
      session.pty.resize(cols, rows);
      session.headless.resize(cols, rows);
    } catch (err) {
      this.logger.warn(
        `[TerminalService] Error resizing PTY ${terminalId}`,
        err,
      );
    }
  }

  // ─── Teardown ────────────────────────────────────────────────

  protected onTeardown(): void {
    this.tearingDown = true;
    for (const [, session] of this.sessions) {
      try {
        session.pty.kill();
      } catch {
        // Best-effort cleanup
      }
      try {
        session.headless.dispose();
      } catch {
        // Best-effort cleanup
      }
    }
    this.sessions.clear();
    this.logger.info('[TerminalService] Torn down');
  }
}
