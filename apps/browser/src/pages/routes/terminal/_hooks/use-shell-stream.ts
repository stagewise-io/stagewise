import { useEffect, useRef, useState } from 'react';
import { useKartonProcedure } from '@pages/hooks/use-karton';
import type { ShellSessionInfo } from '@shared/karton-contracts/pages-api';

interface UseShellStreamOptions {
  agentInstanceId: string;
  sessionId: string;
  /** Bytes from the PTY. `null` means the ring buffer evicted past us — clear the terminal before writing the next chunk. */
  onBytes: (data: Uint8Array | null) => void;
  /** Poll interval. Default 80 ms. */
  intervalMs?: number;
}

interface ShellStreamState {
  ready: boolean;
  info: ShellSessionInfo | null;
  exited: boolean;
  exitCode: number | null;
  /** Backend doesn't recognise the session (e.g. it was already cleaned up). */
  notFound: boolean;
  /** Agent is mid-command on this PTY. UI flips to "agent driving" and stops sending keystrokes. */
  agentBusy: boolean;
}

/** Polls `shell.readTail` and pipes bytes to `onBytes`. Stops once the session has exited and drained. */
export function useShellStream(options: UseShellStreamOptions) {
  const { agentInstanceId, sessionId, onBytes, intervalMs = 80 } = options;

  // Karton hands us a fresh closure on every state push (which happens
  // on every PTY chunk). If we put these in the effect deps, the effect
  // would tear down and remount in a tight loop, and xterm would crash.
  // Stash them in refs so the effect only depends on the IDs.
  const readTail = useKartonProcedure((p) => p.shell.readTail);
  const getInfo = useKartonProcedure((p) => p.shell.getInfo);

  const onBytesRef = useRef(onBytes);
  const readTailRef = useRef(readTail);
  const getInfoRef = useRef(getInfo);
  onBytesRef.current = onBytes;
  readTailRef.current = readTail;
  getInfoRef.current = getInfo;

  const [state, setState] = useState<ShellStreamState>({
    ready: false,
    info: null,
    exited: false,
    exitCode: null,
    notFound: false,
    agentBusy: false,
  });

  useEffect(() => {
    let cancelled = false;
    // The `finally` below re-arms the timer unconditionally, so an
    // early `return` inside `try` is not enough to stop polling. Without
    // this flag every closed terminal tab would burn ~12 IPC calls/sec
    // forever.
    let done = false;
    let cursor = 0;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let drainsAfterExit = 0;

    const tick = async () => {
      if (cancelled || done) return;
      try {
        const result = await readTailRef.current(
          agentInstanceId,
          sessionId,
          cursor,
        );
        if (cancelled) return;

        if (!result) {
          setState((prev) =>
            prev.notFound ? prev : { ...prev, ready: true, notFound: true },
          );
          done = true;
          return;
        }

        if (result.truncated) {
          onBytesRef.current(null);
        }

        if (result.data.length > 0) {
          const bytes = base64ToBytes(result.data);
          onBytesRef.current(bytes);
        }

        cursor = result.cursor;

        // Only push a new state object when something actually changed —
        // otherwise we re-render on every poll tick.
        setState((prev) => {
          const nextReady = true;
          const nextExited = result.exited;
          const nextExitCode = result.exitCode;
          const nextAgentBusy = result.agentBusy;
          if (
            prev.ready === nextReady &&
            prev.exited === nextExited &&
            prev.exitCode === nextExitCode &&
            prev.agentBusy === nextAgentBusy
          ) {
            return prev;
          }
          return {
            ...prev,
            ready: nextReady,
            exited: nextExited,
            exitCode: nextExitCode,
            agentBusy: nextAgentBusy,
          };
        });

        if (result.exited) {
          drainsAfterExit += 1;
          if (drainsAfterExit > 2 && result.data.length === 0) {
            done = true;
            return;
          }
        }
      } catch {
        // Transient (e.g. karton blip). Keep polling.
      } finally {
        if (!cancelled && !done) {
          timeoutHandle = setTimeout(tick, intervalMs);
        }
      }
    };

    void getInfoRef.current(agentInstanceId, sessionId).then((info) => {
      if (cancelled) return;
      // Karton returns a new object every call, so deep-compare to avoid
      // a state update on every getInfo retry.
      setState((prev) =>
        shellInfoEquals(prev.info, info) ? prev : { ...prev, info },
      );
    });

    void tick();

    return () => {
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [agentInstanceId, sessionId, intervalMs]);

  return state;
}

function shellInfoEquals(
  a: ShellSessionInfo | null,
  b: ShellSessionInfo | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.id === b.id &&
    a.cwd === b.cwd &&
    a.shellType === b.shellType &&
    a.shellPath === b.shellPath &&
    a.createdAt === b.createdAt &&
    a.exited === b.exited &&
    a.exitCode === b.exitCode
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
