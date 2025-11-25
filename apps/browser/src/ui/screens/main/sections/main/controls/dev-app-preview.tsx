import { cn } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@stagewise/stage-ui/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  PlayIcon,
  RefreshCwIcon,
  BookImageIcon,
  ArrowLeftIcon,
  SquareIcon,
  Loader2Icon,
  ArrowRightIcon,
  BugIcon,
} from 'lucide-react';
import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { Layout, MainTab } from '@stagewise/karton-contract';
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
      <DevAppStateInfo />
      <DevToolsToggle />
      <UrlControl />
    </div>
  );
}

export function UrlControl() {
  const currentUrl = useKartonState((s) => s.webContent?.url);

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

  const isLoading = useKartonState((s) => s.webContent?.isLoading);
  const _title = useKartonState((s) => s.webContent?.title);
  const canGoBack = useKartonState(
    (s) => s.webContent?.navigationHistory?.canGoBack,
  );
  const canGoForward = useKartonState(
    (s) => s.webContent?.navigationHistory?.canGoForward,
  );

  const goBack = useKartonProcedure((p) => p.webContent.goBack);
  const goForward = useKartonProcedure((p) => p.webContent.goForward);
  const reload = useKartonProcedure((p) => p.webContent.reload);
  const stop = useKartonProcedure((p) => p.webContent.stop);
  const goto = useKartonProcedure((p) => p.webContent.goto);

  return (
    <div className="glass-body @[175px]:flex hidden h-10 w-full flex-1 flex-row items-center gap-2 rounded-full bg-background/80 p-1 backdrop-blur-lg">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void goBack()}
        disabled={!canGoBack}
        className="@[320px]:flex hidden"
      >
        <ArrowLeftIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void goForward()}
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
            void goto(buildFullUrl(urlInputRef.current?.value ?? ''));
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
              void goto(buildFullUrl(urlInputRef.current?.value ?? ''));
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
            onClick={() => (isLoading ? void stop() : void reload())}
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
  const devToolsOpen = useKartonState((s) => s.webContent?.devToolsOpen);
  const toggleDevTools = useKartonProcedure((p) => p.webContent.toggleDevTools);

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant={devToolsOpen ? 'primary' : 'secondary'}
          size="icon-md"
          className={!devToolsOpen && 'bg-background/80 backdrop-blur-lg'}
          onClick={() => toggleDevTools()}
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

export function DevAppStateInfo() {
  const appState = useKartonState((s) => s.workspace?.devAppStatus);

  const configuredAppCommand = useKartonState(
    (s) => s.workspace?.config?.appExecutionCommand,
  );

  const startApp = useKartonProcedure((p) => p.workspace.devAppState.start);
  const stopApp = useKartonProcedure((p) => p.workspace.devAppState.stop);
  const restartApp = useKartonProcedure((p) => p.workspace.devAppState.restart);

  const canControlApp = useMemo(() => {
    return !!(appState?.wrappedCommand || configuredAppCommand);
  }, [
    appState?.wrappedCommand,
    configuredAppCommand,
    appState?.childProcessRunning,
  ]);

  const canStartApp = useMemo(() => {
    return !appState?.childProcessRunning;
  }, [appState]);

  const canRestartApp = useMemo(() => {
    return !!appState?.childProcessRunning;
  }, [appState]);

  const canStopApp = useMemo(() => {
    return !!appState?.childProcessRunning;
  }, [appState]);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger>
          <PopoverTrigger>
            <Button
              variant="secondary"
              size="icon-md"
              className="@[320px]:flex hidden bg-background/80 backdrop-blur-lg"
            >
              <PlayIcon className="size-4" />
              <div
                className={cn(
                  'glass-body absolute right-px bottom-px z-10 size-3 rounded-full bg-green-600',
                  appState?.childProcessRunning
                    ? appState?.contentAvailableOnPort
                      ? 'bg-green-600'
                      : 'bg-yellow-600'
                    : 'bg-gray-500',
                )}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Dev App Server Status</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <PopoverTitle>Dev App Server Status</PopoverTitle>
        <div className="flex flex-col items-stretch gap-4">
          <div className="flex flex-col items-stretch gap-2">
            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Child process running
              </p>
              <p className="font-mono text-sm">
                {appState?.childProcessRunning ? 'Yes' : 'No'}
              </p>
            </div>

            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">Child process PID</p>
              <p className="text-sm">{appState?.childProcessPid ?? '––'}</p>
            </div>

            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Child process port
              </p>
              <p className="font-mono text-sm">
                {appState?.childProcessOwnedPorts.join(', ') ?? '––'}
              </p>
            </div>

            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Content available on port
              </p>
              <p className="text-sm">
                {appState?.contentAvailableOnPort ? 'Yes' : 'No'}
              </p>
            </div>

            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">Last error</p>
              <p className="text-sm">
                {appState?.lastChildProcessError?.message ?? 'None'}
              </p>
            </div>
            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">Last error code</p>
              <p className="text-sm">
                {appState?.lastChildProcessError?.code ?? 'None'}
              </p>
            </div>
            <div className="flex flex-row items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">Wrapped command</p>
              <p className="font-mono text-sm">
                {appState?.wrappedCommand ?? 'None'}
              </p>
            </div>
          </div>
        </div>
        {canControlApp && (
          <div className="flex flex-row-reverse items-center justify-start gap-2">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  // className="bg-green-600/20 text-foreground dark:bg-green-700/20"
                  onClick={() => startApp()}
                  disabled={!canStartApp}
                >
                  <PlayIcon className="ml-px size-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start dev server</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  // className="bg-yellow-600/20 text-foreground dark:bg-yellow-700/20"
                  onClick={() => restartApp()}
                  disabled={!canRestartApp}
                >
                  <RefreshCwIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restart dev server</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  // className="bg-rose-600/20 text-rose-50 dark:bg-rose-700/20"
                  onClick={() => stopApp()}
                  disabled={!canStopApp}
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop dev server</TooltipContent>
            </Tooltip>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
