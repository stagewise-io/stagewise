import { cn } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  RefreshCwIcon,
  BookImageIcon,
  ArrowLeftIcon,
  SquareIcon,
  Loader2Icon,
  ArrowRightIcon,
  BugIcon,
} from 'lucide-react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { Layout, MainTab } from '@shared/karton-contracts/ui';
import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { HotkeyActions } from '@/utils';

export function DevAppPreviewControls() {
  const isFullScreen = useKartonState(
    (s) =>
      s.userExperience.activeLayout === Layout.MAIN &&
      s.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW &&
      s.userExperience.devAppPreview.isFullScreen,
  );
  return (
    <div
      className={cn(
        'z-30 flex w-full flex-1 flex-row-reverse items-center justify-start gap-2',
        isFullScreen && 'pr-1',
      )}
    >
      <DevToolsToggle />
      <UrlControl />
    </div>
  );
}

export function UrlControl() {
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const currentUrl = useKartonState((s) =>
    activeTabId ? s.browser.tabs[activeTabId]?.url : '',
  );

  const [urlModified, setUrlModified] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const syncUrlContent = useCallback(() => {
    // We only set the current URL into the URL bar, if:
    //  - The URL wasn't modified by the user.
    //  - The URL input isn't focused/active.
    if (
      !urlModified &&
      document.activeElement !== urlInputRef.current &&
      urlInputRef.current
    ) {
      urlInputRef.current.value = currentUrl;
    } else {
      console.log(
        'Not syncing URL because it was modified by the user or the URL input is focused.',
      );
    }
  }, [currentUrl, urlModified]);
  useEffect(() => {
    syncUrlContent();
  }, [syncUrlContent]);

  // When the user presses Esc while the Url input is focused, we reset the URL modification state and trigger a URL sync.
  const handleResetUrlModification = useCallback(() => {
    if (document.activeElement !== urlInputRef.current) {
      return false;
    }
    urlInputRef.current?.blur();
    setUrlModified(false);
    syncUrlContent();
    return true;
  }, [syncUrlContent]);
  useHotKeyListener(handleResetUrlModification, HotkeyActions.ESC);

  const buildFullUrl = useCallback((url: string) => {
    // We check if the URL is valid. If it's not valid, check if there's a protocol prefix. If there is not protocol prefix, we add https: protocl by default. If the URL still isn't valid, we return a google search string with the input as the query.
    let checkedUrl = url.trim();

    if (checkedUrl.includes(' ') || !checkedUrl.includes('.')) {
      checkedUrl = getSearchUrl(checkedUrl);
    }

    if (checkUrl(checkedUrl)) {
      return checkedUrl;
    }

    if (!checkedUrl.includes(':')) {
      checkedUrl = `https://${checkedUrl}`;
    }

    if (checkUrl(checkedUrl)) {
      return checkedUrl;
    }

    return getSearchUrl(checkedUrl);
  }, []);

  const activeTab = useKartonState((s) =>
    activeTabId ? s.browser.tabs[activeTabId] : null,
  );

  const isLoading = activeTab?.isLoading;
  const _title = activeTab?.title;
  const canGoBack = activeTab?.navigationHistory?.canGoBack;
  const canGoForward = activeTab?.navigationHistory?.canGoForward;

  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const stop = useKartonProcedure((p) => p.browser.stop);
  const goto = useKartonProcedure((p) => p.browser.goto);

  return (
    <div className="glass-body @[175px]:flex hidden h-10 w-full flex-1 flex-row items-center gap-2 rounded-full bg-background/80 p-1 backdrop-blur-lg">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void goBack(activeTabId ?? undefined)}
        disabled={!canGoBack}
        className="@[320px]:flex hidden"
      >
        <ArrowLeftIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void goForward(activeTabId ?? undefined)}
        disabled={!canGoForward}
      >
        <ArrowRightIcon className="size-4" />
      </Button>
      <div className="relative flex-1">
        <Input
          ref={urlInputRef}
          className="flex h-8 w-full max-w-none flex-1 flex-row items-center rounded-full"
          inputClassName="pl-1.5 rounded-full outline-offset-0 h-6 mr-1"
          type="text"
          placeholder="Enter a URL to navigate to..."
          onSubmit={() => {
            void goto(
              buildFullUrl(urlInputRef.current?.value ?? ''),
              activeTabId ?? undefined,
            );
            setUrlModified(false);
            urlInputRef.current?.blur();
          }}
          onChange={() => {
            if (document.activeElement === urlInputRef.current) {
              setUrlModified(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void goto(
                buildFullUrl(urlInputRef.current?.value ?? ''),
                activeTabId ?? undefined,
              );
              setUrlModified(false);
              urlInputRef.current?.blur();
            }
          }}
        />
      </div>

      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            className="@[320px]:flex hidden"
            onClick={() =>
              isLoading
                ? void stop(activeTabId ?? undefined)
                : void reload(activeTabId ?? undefined)
            }
          >
            {isLoading ? (
              <>
                <Loader2Icon className="size-8 animate-spin text-primary" />
                <SquareIcon className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 size-3 fill-current" />
              </>
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isLoading ? 'Stop loading' : 'Reload page'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function SocialMediaPreviewsToggle() {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="secondary"
          size="icon-md"
          className="bg-background/80 backdrop-blur-lg"
        >
          <BookImageIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>View social media previews</TooltipContent>
    </Tooltip>
  );
}

const _screenSizes: Record<
  string,
  { width: number; height: number; presetName: string } | null
> = {
  'full-screen': null,
  'iphone-16': { width: 393, height: 852, presetName: 'iPhone 16' },
  'ipad-11': { width: 810, height: 1080, presetName: 'iPad 11' },
  desktop: { width: 1920, height: 1080, presetName: 'Desktop' },
  'widescreen-desktop': {
    width: 2560,
    height: 1440,
    presetName: 'Widescreen Desktop',
  },
};

function DevToolsToggle() {
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const devToolsOpen = useKartonState((s) =>
    activeTabId ? s.browser.tabs[activeTabId]?.devToolsOpen : false,
  );
  const toggleDevTools = useKartonProcedure((p) => p.browser.toggleDevTools);

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant={devToolsOpen ? 'primary' : 'secondary'}
          size="icon-md"
          className={!devToolsOpen && 'bg-background/80 backdrop-blur-lg'}
          onClick={() => toggleDevTools(activeTabId ?? undefined)}
        >
          <BugIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {devToolsOpen ? 'Close dev tools' : 'Open dev tools'}
      </TooltipContent>
    </Tooltip>
  );
}

const checkUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const getSearchUrl = (query: string) => {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};
