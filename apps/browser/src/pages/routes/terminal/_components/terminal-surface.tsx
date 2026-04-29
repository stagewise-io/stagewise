import { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@ui/utils';
import { useKartonProcedure } from '@pages/hooks/use-karton';
import { useShellStream } from '../_hooks/use-shell-stream';
import type { ShellOwnership } from './ownership-capsule';
import type { ShellSessionInfo } from '@shared/karton-contracts/pages-api';

interface TerminalSurfaceProps {
  agentInstanceId: string;
  sessionId: string;
  ownership: ShellOwnership;
  onInfo: (info: ShellSessionInfo | null) => void;
  onExitState: (exited: boolean, exitCode: number | null) => void;
  onAgentBusy: (busy: boolean) => void;
  onNotFound: () => void;
}

export function TerminalSurface({
  agentInstanceId,
  sessionId,
  ownership,
  onInfo,
  onExitState,
  onAgentBusy,
  onNotFound,
}: TerminalSurfaceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onInfoRef = useRef(onInfo);
  const onExitStateRef = useRef(onExitState);
  const onAgentBusyRef = useRef(onAgentBusy);
  const onNotFoundRef = useRef(onNotFound);
  onInfoRef.current = onInfo;
  onExitStateRef.current = onExitState;
  onAgentBusyRef.current = onAgentBusy;
  onNotFoundRef.current = onNotFound;

  // Read inside the term.onData callback. A ref avoids re-binding the
  // listener every render — xterm's listener detach is finicky.
  const ownershipRef = useRef<ShellOwnership>(ownership);
  ownershipRef.current = ownership;

  const writeStdin = useKartonProcedure((p) => p.shell.writeStdin);
  const resizeShell = useKartonProcedure((p) => p.shell.resize);

  useEffect(() => {
    if (!hostRef.current) return;
    // Cursor: solid block when focused, hollow outline when not — same
    // as the VSCode integrated terminal. xterm reads these once at
    // construction, so changes here need a full tab reopen.
    const term = new Terminal({
      fontFamily:
        '"Roboto Mono", ui-monospace, Menlo, Monaco, "SF Mono", monospace',
      fontSize: 12,
      // 1.0 matches VSCode and keeps the cursor block the same height
      // as the text. 1.5 made the cursor look oversized.
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: false, // toggled by ownership effect below
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline',
      scrollback: 5000,
      allowProposedApi: true,
      theme: readTermTheme(hostRef.current),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    // Defer focus to the next frame: TanStack Router activates the
    // new tab after our mount effect, so a synchronous focus() loses
    // to the activation. Same frame, re-read the theme — at mount
    // time the cascade may not be fully resolved yet.
    const focusFrame = requestAnimationFrame(() => {
      term.focus();
      term.options.theme = readTermTheme(hostRef.current);
      term.refresh(0, term.rows - 1);
    });
    termRef.current = term;
    fitRef.current = fit;

    // Push the rendered grid to the PTY so COLUMNS/LINES match from
    // the start, instead of wrapping at the 120/24 default.
    void resizeShell(agentInstanceId, sessionId, term.cols, term.rows);

    // User input → backend stdin. Ownership read via ref so toggling
    // it doesn't rebind the listener.
    const onDataDisposable = term.onData((bytes) => {
      if (ownershipRef.current !== 'user') return;
      void writeStdin(agentInstanceId, sessionId, bytes);
    });

    // Observe the wrapper, not the host. xterm's scrollbar shifts the
    // host's content-box by a hairline on scroll, which would re-fire
    // fit() and redraw the canvas mid-scroll — visible as jitter.
    // rAF-throttle so one drag = at most one fit per frame; otherwise
    // the canvas teardown/rebuild flashes white on macOS.
    let fitRafHandle: number | null = null;
    const ro = new ResizeObserver(() => {
      if (fitRafHandle !== null) return;
      fitRafHandle = requestAnimationFrame(() => {
        fitRafHandle = null;
        try {
          const proposed = fit.proposeDimensions();
          if (
            proposed &&
            (proposed.cols !== term.cols || proposed.rows !== term.rows)
          ) {
            fit.fit();
            void resizeShell(agentInstanceId, sessionId, term.cols, term.rows);
          }
        } catch {
          // host detached during teardown — ignore
        }
      });
    });
    if (wrapperRef.current) ro.observe(wrapperRef.current);

    // Theme sync. Defer to rAF so getComputedStyle sees the new cascade.
    // `term.refresh` is required: setting `term.options.theme` updates
    // the palette but does NOT repaint already-drawn cells.
    // Two triggers because the app supports both prefers-color-scheme
    // (Electron's nativeTheme) and a class on documentElement.
    let themeRafHandle: number | null = null;
    const scheduleThemeUpdate = () => {
      if (themeRafHandle !== null) return;
      themeRafHandle = requestAnimationFrame(() => {
        themeRafHandle = null;
        term.options.theme = readTermTheme(hostRef.current);
        term.refresh(0, term.rows - 1);
      });
    };
    const themeObserver = new MutationObserver(scheduleThemeUpdate);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    const colorSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
    colorSchemeMql.addEventListener('change', scheduleThemeUpdate);

    return () => {
      cancelAnimationFrame(focusFrame);
      if (fitRafHandle !== null) cancelAnimationFrame(fitRafHandle);
      if (themeRafHandle !== null) cancelAnimationFrame(themeRafHandle);
      onDataDisposable.dispose();
      ro.disconnect();
      themeObserver.disconnect();
      colorSchemeMql.removeEventListener('change', scheduleThemeUpdate);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [agentInstanceId, sessionId, writeStdin, resizeShell]);

  // Blink only when the user is driving — calm signal for "not yours".
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.cursorBlink = ownership === 'user';
  }, [ownership]);

  const stream = useShellStream({
    agentInstanceId,
    sessionId,
    onBytes: (data) => {
      const term = termRef.current;
      if (!term) return;
      if (data === null) {
        // Truncation signal — server says we've fallen off the ring buffer.
        term.reset();
        return;
      }
      term.write(data);
    },
  });

  // Lift state changes back to the page.
  useEffect(() => {
    onInfoRef.current(stream.info);
  }, [stream.info]);
  useEffect(() => {
    onExitStateRef.current(stream.exited, stream.exitCode);
  }, [stream.exited, stream.exitCode]);
  useEffect(() => {
    onAgentBusyRef.current(stream.agentBusy);
  }, [stream.agentBusy]);
  useEffect(() => {
    if (stream.notFound) onNotFoundRef.current();
  }, [stream.notFound]);

  return (
    <div className="flex min-h-0 flex-1 flex-row bg-background dark:bg-surface-1">
      {/* Wrapper bounds + clips so xterm activates its own scrollback.
          Padding lives on the host so xterm measures the real area. */}
      <div
        ref={wrapperRef}
        className={cn(
          'relative min-h-0 min-w-0 flex-1 overflow-hidden px-3 py-2',
          ownership === 'agent' && 'cursor-not-allowed',
        )}
        onClick={() => {
          if (ownership === 'user') termRef.current?.focus();
        }}
      >
        <div
          ref={hostRef}
          role="region"
          aria-label="Terminal output"
          className="relative h-full w-full"
        />
      </div>
    </div>
  );
}

function readTermTheme(hostEl: HTMLElement | null): ITheme {
  // Walk up the DOM and use the first opaque background we find. We
  // can't pass our `oklch(...)` tokens directly — xterm's color parser
  // doesn't understand them. `getComputedStyle` returns normalized
  // `rgb(...)` which it does.
  let bg = '';
  let el: HTMLElement | null = hostEl;
  while (el) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
      bg = c;
      break;
    }
    el = el.parentElement;
  }
  // Match Tailwind 4's `dark:` variant: prefers-color-scheme + explicit
  // `.dark` override on documentElement.
  const isDark =
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  // Hardcoded high-contrast fg/bg. The app's `--color-foreground` is
  // a muted body-text gray that's wrong for terminal rendering.
  const fg = isDark ? '#ffffff' : '#1f1f1f';
  if (!bg) {
    bg = isDark ? '#0b0b0c' : '#ffffff';
  }
  // Block cursor needs an inverted glyph to stay readable when sitting
  // over text — pair `cursorAccent` with the background. Selection
  // uses a neutral overlay so it works in both themes.
  return {
    background: bg,
    foreground: fg,
    cursor: fg,
    cursorAccent: bg,
    selectionBackground: 'rgba(127, 127, 127, 0.35)',
    selectionForeground: fg,
  };
}
