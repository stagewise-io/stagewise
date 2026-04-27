import { useCallback, useEffect, useState } from 'react';
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
  const [copied, setCopied] = useState(false);

  const onCtrlClick = useCallback((e: React.MouseEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => {
    setMenuPos(null);
    setCopied(false);
  }, []);

  const copyId = useCallback(() => {
    navigator.clipboard.writeText(agentId);
    setCopied(true);
    setTimeout(() => {
      setMenuPos(null);
      setCopied(false);
    }, 1200);
  }, [agentId]);

  useEffect(() => {
    if (!menuPos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuPos, close]);

  const menuPortal =
    menuPos &&
    createPortal(
      <>
        <div className="fixed inset-0 z-40" onClick={close} />
        <div
          className={cn(
            'fixed z-50 flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
            'rounded-lg border border-border-subtle bg-background p-1',
            'text-xs shadow-lg',
          )}
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button type="button" className={itemClassName} onClick={copyId}>
            {copied ? 'Copied!' : 'Copy agent ID'}
          </button>
        </div>
      </>,
      document.body,
    );

  return { onCtrlClick, menuPortal };
}
