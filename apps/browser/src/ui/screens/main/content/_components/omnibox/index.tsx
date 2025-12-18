import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconCommand } from 'nucleo-micro-bold';
import type { TabState } from '@shared/karton-contracts/ui';
import { useEventListener } from '@/hooks/use-event-listener';
import { InternalPageBreadcrumbs } from './internal-page-breadcrumbs';

export interface OmniboxRef {
  focus: () => void;
}

interface OmniboxProps {
  activeTab: TabState | undefined;
  activeTabId: string | undefined;
  tabs: Record<string, TabState>;
  goto: (url: string, tabId?: string) => void;
}

function goToUrl(
  goto: (url: string, tabId?: string) => void,
  url: string,
  tabId?: string,
) {
  const trimmed = url.trim();
  // Check if it starts with stagewise:/ - always treat as URL, never search
  if (trimmed.toLowerCase().startsWith('stagewise:/')) {
    return goto(trimmed, tabId);
  }
  // Check if it's already a valid URL with protocol
  try {
    new URL(trimmed);
    return goto(trimmed, tabId);
  } catch {}
  // Check if it looks like a domain (no spaces, has a dot)
  if (!trimmed.includes(' ') && trimmed.includes('.'))
    return goto(`https://${trimmed}`, tabId);
  // Treat as search query
  goto(`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, tabId);
}

export const Omnibox = forwardRef<OmniboxRef, OmniboxProps>(
  ({ activeTab, activeTabId, tabs, goto }, ref) => {
    const [localUrl, setLocalUrl] = useState(activeTab?.url ?? '');
    const [urlBeforeEdit, setUrlBeforeEdit] = useState(activeTab?.url ?? '');
    const [isUrlInputFocused, setIsUrlInputFocused] = useState(false);
    const urlInputRef = useRef<HTMLInputElement>(null);

    // Expose focus method via ref
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          setIsUrlInputFocused(true);
          setTimeout(() => {
            urlInputRef.current?.focus();
            urlInputRef.current?.select();
          }, 0);
        },
      }),
      [],
    );

    // Update local URL when tab changes
    useEffect(() => {
      if (activeTab?.url === 'ui-main') {
        setLocalUrl('');
        setUrlBeforeEdit('');
      } else {
        setLocalUrl(activeTab?.url ?? '');
        setUrlBeforeEdit(activeTab?.url ?? '');
      }
      // Reset focus state when tab changes
      setIsUrlInputFocused(false);
    }, [activeTab?.url, activeTabId]);

    // Check if URL is a stagewise://internal/ URL
    const isStagewiseInternalUrl = useMemo(() => {
      const url = activeTab?.url ?? '';
      return url.startsWith('stagewise://internal/');
    }, [activeTab?.url]);

    const handleBreadcrumbClick = useCallback(() => {
      // Set focus state first to render the input
      setIsUrlInputFocused(true);
      // Use setTimeout to ensure the input is rendered before focusing
      setTimeout(() => {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }, 0);
    }, []);

    const handleInputFocus = useCallback(() => {
      setUrlBeforeEdit(tabs[activeTabId ?? '']?.url ?? '');
      setIsUrlInputFocused(true);
    }, [tabs, activeTabId]);

    const handleInputBlur = useCallback(() => {
      setIsUrlInputFocused(false);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          goToUrl(goto, localUrl, activeTabId);
          setUrlBeforeEdit(localUrl);
          urlInputRef.current?.blur();
        }
      },
      [goto, localUrl, activeTabId],
    );

    // Handle Escape key to cancel editing
    useEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.code === 'Escape') {
          setLocalUrl(urlBeforeEdit);
          urlInputRef.current?.blur();
        }
      },
      { capture: true },
      urlInputRef.current,
    );

    return (
      <div className="relative flex flex-1 items-center rounded-full bg-zinc-500/5 pr-5 pl-3 focus-within:bg-zinc-500/10">
        {!isUrlInputFocused && isStagewiseInternalUrl && activeTab?.url ? (
          <InternalPageBreadcrumbs
            url={activeTab.url}
            onFocusInput={handleBreadcrumbClick}
          />
        ) : (
          <input
            ref={urlInputRef}
            placeholder="Search or type a URL"
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className="h-8 w-full truncate rounded-full px-2 text-foreground text-sm outline-none"
            onKeyDown={handleKeyDown}
          />
        )}
        <div className="pointer-events-none flex shrink-0 flex-row items-center gap-1 opacity-40">
          <IconCommand className="size-3 text-muted-foreground" />
          <span className="font-mono text-muted-foreground text-xs">L</span>
        </div>
      </div>
    );
  },
);

Omnibox.displayName = 'Omnibox';
