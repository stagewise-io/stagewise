import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Loader2Icon, TerminalIcon } from 'lucide-react';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { ShellSessionSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { cn } from '@ui/utils';

// ─── Route definition ─────────────────────────────────────────

type SearchParams = { sessionId?: string };

export const Route = createFileRoute('/shell-terminal/$agentInstanceId')({
  component: ShellTerminalPage,
  head: () => ({ meta: [{ title: 'Shell Terminal' }] }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    sessionId:
      typeof search.sessionId === 'string' ? search.sessionId : undefined,
  }),
});

const EMPTY_SESSIONS: ShellSessionSnapshot[] = [];
const EMPTY_CHUNKS: Record<string, string[]> = {};

// ─── Theme ────────────────────────────────────────────────────

function getXtermTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const pick = (v: string) => style.getPropertyValue(v).trim() || undefined;

  return {
    background: pick('--color-background') || '#1e1e1e',
    foreground: pick('--color-foreground') || '#d4d4d4',
    cursor: pick('--color-foreground') || '#d4d4d4',
    cursorAccent: pick('--color-background') || '#1e1e1e',
    selectionBackground: pick('--color-surface-2') || '#264f78',
    selectionForeground: pick('--color-foreground') || '#d4d4d4',

    // ANSI palette — fixed colors that look correct on dark backgrounds
    black: '#1e1e1e',
    red: '#f44747',
    green: '#6a9955',
    yellow: '#d7ba7d',
    blue: '#569cd6',
    magenta: '#c586c0',
    cyan: '#4ec9b0',
    white: '#d4d4d4',
    brightBlack: '#808080',
    brightRed: '#f44747',
    brightGreen: '#6a9955',
    brightYellow: '#d7ba7d',
    brightBlue: '#569cd6',
    brightMagenta: '#c586c0',
    brightCyan: '#4ec9b0',
    brightWhite: '#ffffff',
  };
}

// ─── Helpers ──────────────────────────────────────────────────

const PATH_SEP_RE = /[/\\]/;
function cwdBasename(cwd: string): string {
  return cwd.split(PATH_SEP_RE).pop() || cwd;
}

type TermEntry = {
  term: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  initialized: boolean;
};

// ─── Tab bar ──────────────────────────────────────────────────

function SessionTabBar({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: ShellSessionSnapshot[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-row items-stretch overflow-x-auto bg-background">
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        const label = s.cwd ? cwdBasename(s.cwd) : s.id.slice(0, 8);
        return (
          <button
            key={s.id}
            type="button"
            className={cn(
              'relative shrink-0 cursor-pointer whitespace-nowrap px-3 py-1.5 font-medium text-xs transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
            onClick={() => onSelect(s.id)}
          >
            {label}
            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-px rounded-full bg-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

function ShellTerminalPage() {
  const { agentInstanceId } = Route.useParams();
  const { sessionId: focusSessionId } = Route.useSearch();

  // ── Karton state & procedures ──
  const allSessions = useKartonState(
    (s) => s.shellSessions[agentInstanceId] ?? EMPTY_SESSIONS,
  ) as ShellSessionSnapshot[];

  const sessions = useMemo(
    () => allSessions.filter((s) => !s.exited),
    [allSessions],
  );

  const chunks = useKartonState(
    (s) => s.pendingShellTerminalChunks ?? EMPTY_CHUNKS,
  ) as Record<string, string[]>;

  const getReplayBuffer = useKartonProcedure(
    (p) => p.shellTerminal.getReplayBuffer,
  );
  const openStream = useKartonProcedure((p) => p.shellTerminal.openStream);
  const closeStream = useKartonProcedure((p) => p.shellTerminal.closeStream);
  const resizeTerminal = useKartonProcedure(
    (p) => p.shellTerminal.resizeTerminal,
  );

  // ── Active session tracking ──
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const replayLoadedRef = useRef(new Set<string>());
  const [replayReadyForUI, setReplayReadyForUI] = useState<Set<string>>(
    () => new Set(),
  );
  const consumedChunksRef = useRef(new Map<string, string[]>());

  // Sorted sessions (chronological, oldest first)
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => a.createdAt - b.createdAt),
    [sessions],
  );

  // React to focusSessionId search param changes (from footer card navigation)
  useEffect(() => {
    if (focusSessionId) setActiveSessionId(focusSessionId);
  }, [focusSessionId]);

  // Fallback: if activeSessionId is null or doesn't exist, pick the first
  const resolvedActiveId = useMemo(() => {
    if (activeSessionId && sortedSessions.some((s) => s.id === activeSessionId))
      return activeSessionId;

    return sortedSessions[0]?.id ?? null;
  }, [activeSessionId, sortedSessions]);

  // ── Terminal instances map ──
  const termsRef = useRef(new Map<string, TermEntry>());
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getOrCreateTerm = useCallback((sessionId: string): TermEntry => {
    const existing = termsRef.current.get(sessionId);
    if (existing) return existing;

    const theme = getXtermTheme();
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, Menlo, Monaco, "Cascadia Code", monospace',
      theme,
      scrollback: 10000,
      convertEol: false,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Each terminal gets its own persistent container div
    const container = document.createElement('div');
    container.className = 'absolute inset-0 p-2';
    container.style.display = 'none';

    const entry: TermEntry = {
      term,
      fitAddon,
      container,
      initialized: false,
    };
    termsRef.current.set(sessionId, entry);
    return entry;
  }, []);

  // ── Show/hide terminal containers based on active tab ──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !resolvedActiveId) return;

    const entry = getOrCreateTerm(resolvedActiveId);

    // Append container to wrapper if not already there
    if (!entry.container.parentNode) wrapper.appendChild(entry.container);

    // Open terminal into its own container on first use
    if (!entry.initialized) {
      entry.term.open(entry.container);
      entry.initialized = true;
    }

    // Toggle visibility: show active, hide all others
    for (const [sid, e] of Array.from(termsRef.current.entries()))
      e.container.style.display = sid === resolvedActiveId ? '' : 'none';

    // Fit after showing and propagate size to PTY
    requestAnimationFrame(() => {
      try {
        const colsBefore = entry.term.cols;
        const rowsBefore = entry.term.rows;
        entry.fitAddon.fit();
        if (entry.term.cols !== colsBefore || entry.term.rows !== rowsBefore) {
          resizeTerminal(
            agentInstanceId,
            resolvedActiveId,
            entry.term.cols,
            entry.term.rows,
          );
        }
      } catch {
        // Container may not be visible yet
      }
    });
  }, [resolvedActiveId, getOrCreateTerm, agentInstanceId, resizeTerminal]);

  // ── Fetch replay buffer on first activation, then open stream ──
  useEffect(() => {
    if (!resolvedActiveId) return;
    if (replayLoadedRef.current.has(resolvedActiveId)) return;
    const entry = termsRef.current.get(resolvedActiveId);
    if (!entry) return;

    // Guard immediately via ref — survives re-renders without triggering deps
    replayLoadedRef.current.add(resolvedActiveId);

    const controller = new AbortController();

    getReplayBuffer(agentInstanceId, resolvedActiveId)
      .then((result) => {
        if (controller.signal.aborted) {
          // StrictMode cleanup — allow retry on next mount
          replayLoadedRef.current.delete(resolvedActiveId);
          return;
        }
        if (result.found && result.data) {
          const bytes = Uint8Array.from(atob(result.data), (c) =>
            c.charCodeAt(0),
          );
          entry.term.write(bytes);
        }
        // Open stream AFTER replay write — prevents replay/stream overlap
        if (!openedStreamsRef.current.has(resolvedActiveId)) {
          openedStreamsRef.current.add(resolvedActiveId);
          openStream(agentInstanceId, resolvedActiveId);
        }
        // Update state for UI loading overlay only
        setReplayReadyForUI((prev) => {
          const next = new Set(prev);
          next.add(resolvedActiveId);
          return next;
        });
      })
      .catch(() => {
        // Allow retry on next activation
        replayLoadedRef.current.delete(resolvedActiveId);
      });

    return () => controller.abort();
  }, [resolvedActiveId, agentInstanceId, getReplayBuffer, openStream]);

  // ── Stream lifecycle: opened lazily in replay .then(), closed on unmount ──
  const openedStreamsRef = useRef(new Set<string>());
  const closeStreamRef = useRef(closeStream);
  closeStreamRef.current = closeStream;
  const agentIdRef = useRef(agentInstanceId);
  agentIdRef.current = agentInstanceId;

  useEffect(() => {
    return () => {
      Array.from(openedStreamsRef.current).forEach((sid) => {
        closeStreamRef.current(agentIdRef.current, sid);
      });
      openedStreamsRef.current.clear();

      // Dispose all terminals and remove their containers
      Array.from(termsRef.current.values()).forEach((entry) => {
        entry.term.dispose();
        entry.container.remove();
      });
      termsRef.current.clear();
    };
  }, []);

  // ── Write live streaming chunks to terminals ──
  useEffect(() => {
    for (const [key, chunkArr] of Object.entries(chunks)) {
      // Skip already-consumed array (same reference = same flush)
      if (consumedChunksRef.current.get(key) === chunkArr) continue;

      // key format: `agentInstanceId:sessionId`
      const colonIdx = key.indexOf(':');
      if (colonIdx === -1) continue;
      const keyAgent = key.slice(0, colonIdx);
      const keySession = key.slice(colonIdx + 1);
      if (keyAgent !== agentInstanceId) continue;

      const entry = termsRef.current.get(keySession);
      if (!entry || !replayLoadedRef.current.has(keySession)) continue;

      // Mark consumed BEFORE writing (prevents double-write on re-render)
      consumedChunksRef.current.set(key, chunkArr);

      for (const b64 of chunkArr) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        entry.term.write(bytes);
      }
    }
  }, [chunks, agentInstanceId]);

  // ── Resize handling ──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver(() => {
      if (!resolvedActiveId) return;
      const entry = termsRef.current.get(resolvedActiveId);
      if (entry?.initialized) {
        try {
          const colsBefore = entry.term.cols;
          const rowsBefore = entry.term.rows;
          entry.fitAddon.fit();
          if (
            entry.term.cols !== colsBefore ||
            entry.term.rows !== rowsBefore
          ) {
            resizeTerminal(
              agentInstanceId,
              resolvedActiveId,
              entry.term.cols,
              entry.term.rows,
            );
          }
        } catch {
          // ignore
        }
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [resolvedActiveId, agentInstanceId, resizeTerminal]);

  // ── Not found state ──
  if (sortedSessions.length === 0) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <TerminalIcon className="size-8 opacity-50" />
        <p className="text-sm">No shell sessions found for this agent.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-16">
      {/* Centered panel */}
      <div className="flex h-full max-h-112 w-full max-w-5xl flex-col overflow-visible">
        {/* Tab bar */}
        <SessionTabBar
          sessions={sortedSessions}
          activeSessionId={resolvedActiveId}
          onSelect={setActiveSessionId}
        />

        {/* Terminal area */}
        <div className="relative min-h-0 flex-1">
          <div ref={wrapperRef} className="absolute inset-0" />

          {/* Loading overlay for active session before replay is loaded */}
          {resolvedActiveId && !replayReadyForUI.has(resolvedActiveId) && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
