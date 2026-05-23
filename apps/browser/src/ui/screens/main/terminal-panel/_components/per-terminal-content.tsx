import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import '@xterm/xterm/css/xterm.css';

interface PerTerminalContentProps {
  terminalId: string;
  isActive: boolean;
}

const BACKEND_RESIZE_DEBOUNCE_MS = 80;

export function PerTerminalContent({
  terminalId,
  isActive,
}: PerTerminalContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  /** Absolute backend output offset consumed by this renderer. */
  const consumedOffsetRef = useRef(0);

  const outputBuffer = useKartonState(
    (s) => s.terminals.outputBuffers[terminalId] ?? '',
  );
  const baseOffset = useKartonState(
    (s) => s.terminals.outputBufferOffsets[terminalId]?.baseOffset ?? 0,
  );
  const endOffset = useKartonState(
    (s) => s.terminals.outputBufferOffsets[terminalId]?.endOffset ?? 0,
  );
  const terminalInput = useKartonProcedure((p) => p.browser.terminalInput);
  const terminalResize = useKartonProcedure((p) => p.browser.terminalResize);
  const getTerminalSnapshot = useKartonProcedure(
    (p) => p.browser.getTerminalSnapshot,
  );

  const terminalInputRef = useRef(terminalInput);
  terminalInputRef.current = terminalInput;
  const terminalResizeRef = useRef(terminalResize);
  terminalResizeRef.current = terminalResize;
  const getTerminalSnapshotRef = useRef(getTerminalSnapshot);
  getTerminalSnapshotRef.current = getTerminalSnapshot;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const sendResize = (immediate = false) => {
    const term = terminalRef.current;
    if (!term) return;

    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }

    const sendCurrentSize = () => {
      const currentTerm = terminalRef.current;
      if (!currentTerm) return;

      const size = { cols: currentTerm.cols, rows: currentTerm.rows };
      const lastSize = lastSentSizeRef.current;
      if (
        lastSize &&
        lastSize.cols === size.cols &&
        lastSize.rows === size.rows
      )
        return;

      lastSentSizeRef.current = size;
      terminalResizeRef.current(terminalId, size.cols, size.rows);
    };

    if (immediate) {
      sendCurrentSize();
      return;
    }

    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      sendCurrentSize();
    }, BACKEND_RESIZE_DEBOUNCE_MS);
  };

  const HUES = {
    base: 85,
    green: 152,
    red: 25,
    blue: 220,
    yellow: 65,
    magenta: 300,
    cyan: 175,
  } as const;

  const getTheme = () => {
    const styles = getComputedStyle(document.documentElement);
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const bg = styles.getPropertyValue('--color-background').trim();
    const fg = styles.getPropertyValue('--color-foreground').trim();

    const ansi = (hue: number, l: number, c: number) =>
      `oklch(${l} ${c} ${hue})`;
    const neutral = (l: number) => ansi(HUES.base, l, 0.002);

    return {
      background: bg || (isDark ? '#0f0f14' : '#fafafa'),
      foreground: fg || (isDark ? '#e0e0e0' : '#1a1a1a'),
      cursor: fg || (isDark ? '#e0e0e0' : '#1a1a1a'),
      selectionBackground: isDark
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(0,0,0,0.1)',
      black: neutral(isDark ? 0.25 : 0.92),
      red: ansi(HUES.red, isDark ? 0.55 : 0.45, isDark ? 0.16 : 0.14),
      green: ansi(HUES.green, isDark ? 0.55 : 0.45, isDark ? 0.14 : 0.16),
      yellow: ansi(HUES.yellow, isDark ? 0.55 : 0.45, isDark ? 0.15 : 0.17),
      blue: ansi(HUES.blue, isDark ? 0.55 : 0.45, isDark ? 0.14 : 0.16),
      magenta: ansi(HUES.magenta, isDark ? 0.55 : 0.45, isDark ? 0.14 : 0.18),
      cyan: ansi(HUES.cyan, isDark ? 0.55 : 0.45, isDark ? 0.1 : 0.15),
      white: neutral(isDark ? 0.75 : 0.35),
      brightBlack: neutral(isDark ? 0.45 : 0.65),
      brightRed: ansi(HUES.red, isDark ? 0.7 : 0.5, isDark ? 0.18 : 0.2),
      brightGreen: ansi(HUES.green, isDark ? 0.7 : 0.5, isDark ? 0.16 : 0.2),
      brightYellow: ansi(HUES.yellow, isDark ? 0.7 : 0.5, isDark ? 0.17 : 0.2),
      brightBlue: ansi(HUES.blue, isDark ? 0.7 : 0.5, isDark ? 0.16 : 0.2),
      brightMagenta: ansi(
        HUES.magenta,
        isDark ? 0.7 : 0.5,
        isDark ? 0.16 : 0.2,
      ),
      brightCyan: ansi(HUES.cyan, isDark ? 0.7 : 0.5, isDark ? 0.12 : 0.17),
      brightWhite: neutral(isDark ? 0.92 : 0.2),
    };
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;

    const term = new Terminal({
      theme: getTheme(),
      fontFamily:
        "'Roboto Mono', Menlo, Monaco, stagewise-builtin-roboto-mono, 'Noto Sans Mono', ui-monospace, 'SF Mono', 'Segoe UI Mono', 'Ubuntu Mono', 'Noto Mono', 'Liberation Mono', 'Inter Mono', Consolas, monospace",
      fontSize: 13,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      letterSpacing: 0,
      lineHeight: 1,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    term.loadAddon(fitAddon);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // Fall back to canvas renderer if WebGL is unavailable.
    }

    let aborted = false;
    let fitTimer = 0;

    const init = async () => {
      await document.fonts.ready;
      await document.fonts.load('normal 400 13px "Roboto Mono"');
      if (aborted) return;

      const snapshot = await getTerminalSnapshotRef.current(terminalId);
      if (aborted) return;

      // Backend snapshot is the source of truth.  It includes the
      // absolute offset of the last byte represented by the serialized
      // headless terminal state.  Live deltas below only apply bytes
      // with offsets greater than this value.
      term.resize(snapshot.cols, snapshot.rows);
      if (snapshot.state) {
        term.write(snapshot.state);
      }
      consumedOffsetRef.current = snapshot.endOffset;

      term.open(container);
      terminalRef.current = term;

      term.onData((data: string) => {
        terminalInputRef.current(terminalId, data);
      });

      fitTimer = requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          sendResize(true);
          if (isActiveRef.current) term.focus();
        } catch {
          // May fail during layout transitions.
        }
      });
    };

    init();

    return () => {
      aborted = true;
      term.dispose();
      if (terminalRef.current === term) {
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      lastSentSizeRef.current = null;
      cancelAnimationFrame(fitTimer);
    };
  }, [terminalId]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = getTheme();
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    if (endOffset <= consumedOffsetRef.current) return;

    // If our consumed offset fell behind the retained backend buffer,
    // recover by replaying the retained buffer from its base.  Normal
    // remounts should never hit this because snapshots set consumed to
    // snapshot.endOffset.
    const startOffset = Math.max(consumedOffsetRef.current, baseOffset);
    const startIndex = startOffset - baseOffset;
    const data = outputBuffer.slice(startIndex);

    if (data.length > 0) {
      term.write(data);
      consumedOffsetRef.current = endOffset;
    }
  }, [outputBuffer, baseOffset, endOffset]);

  useEffect(() => {
    if (!isActive) return;
    const term = terminalRef.current;
    const fit = fitAddonRef.current;
    if (!term || !fit) return;
    const tid = setTimeout(() => {
      try {
        fit.fit();
        sendResize(true);
        term.focus();
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(tid);
  }, [isActive, terminalId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const term = terminalRef.current;
      const fit = fitAddonRef.current;
      if (!term || !fit) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      try {
        fit.fit();
        sendResize();
      } catch {
        // Ignore fit errors during transition.
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      className="size-full bg-background p-1"
      style={{ display: isActive ? undefined : 'none' }}
    />
  );
}
