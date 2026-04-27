import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@ui/utils';

const itemClassName = cn(
  'flex w-full cursor-default flex-row items-center justify-start gap-2',
  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
  'transition-colors duration-150 ease-out',
  'hover:bg-surface-1',
);

export function useAgentIdContextMenu(agentId: string) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [adjustedPos, setAdjustedPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const clearCopyTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCopyTimeout(), [clearCopyTimeout]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => {
    clearCopyTimeout();
    setMenuPos(null);
    setCopied(false);
  }, [clearCopyTimeout]);

  const copyId = useCallback(() => {
    clearCopyTimeout();
    navigator.clipboard
      .writeText(agentId)
      .then(() => {
        setCopied(true);
        timeoutRef.current = setTimeout(() => {
          setMenuPos(null);
          setCopied(false);
          timeoutRef.current = null;
        }, 1200);
      })
      .catch(() => {
        // clipboard write failed — leave menu open, don't show "Copied!"
      });
  }, [agentId, clearCopyTimeout]);

  useEffect(() => {
    if (!menuPos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuPos, close]);

  // Clamp popup to viewport after each open/reposition.
  useLayoutEffect(() => {
    if (!menuPos) {
      setAdjustedPos(null);
      return;
    }
    const popup = popupRef.current;
    if (!popup) return;
    const { width, height } = popup.getBoundingClientRect();
    setAdjustedPos({
      left: Math.max(8, Math.min(menuPos.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menuPos.y, window.innerHeight - height - 8)),
    });
  }, [menuPos]);

  const menuPortal =
    menuPos &&
    createPortal(
      <>
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40"
          onClick={close}
        />
        <div
          ref={popupRef}
          role="menu"
          className={cn(
            'fixed z-50 flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
            'rounded-lg border border-border-subtle bg-background p-1',
            'text-xs shadow-lg',
          )}
          style={{
            left: adjustedPos?.left ?? menuPos.x,
            top: adjustedPos?.top ?? menuPos.y,
            visibility: adjustedPos ? 'visible' : 'hidden',
          }}
        >
          <button
            autoFocus
            type="button"
            role="menuitem"
            className={itemClassName}
            onClick={copyId}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                close();
              }
            }}
          >
            {copied ? 'Copied!' : 'Copy agent ID'}
          </button>
        </div>
      </>,
      document.body,
    );

  return { onContextMenu, menuPortal };
}
