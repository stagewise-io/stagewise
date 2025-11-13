import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { cn, getIFrame } from '@/utils';
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
  Maximize2Icon,
  ProportionsIcon,
  CodeIcon,
  Minimize2Icon,
  RefreshCwIcon,
  BookImageIcon,
  ArrowLeftIcon,
  SquareIcon,
  Loader2Icon,
} from 'lucide-react';
import { useCallback, useState, useMemo } from 'react';
import { RadioGroup, Radio } from '@stagewise/stage-ui/components/radio';
import {
  FormField,
  FormFieldLabel,
  FormFieldTitle,
} from '@stagewise/stage-ui/components/form';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { Layout, MainTab } from '@stagewise/karton-contract';
import { usePostHog } from 'posthog-js/react';

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
      <ScreenSizeControl />
      <UrlControl />
    </div>
  );
}

export function UrlControl() {
  const [url, setUrl] = useState('');
  const [isOverridingUrl, setIsOverridingUrl] = useState(false);

  const syncUrl = useCallback(() => {
    if (isOverridingUrl) return;
    // Fetch everything in the url thats past the origin, unless the origin is different to the one of the main app.
    const mainAppOrigin = window.location.origin;
    const iframeOrigin = getIFrame()?.contentWindow?.location.origin;
    if (iframeOrigin !== mainAppOrigin) {
      setUrl(getIFrame()?.contentWindow?.location.href ?? '');
    } else {
      setUrl(
        getIFrame()?.contentWindow?.location.href?.split(mainAppOrigin)[1] ??
          '',
      );
    }
  }, [getIFrame, url, isOverridingUrl]);

  useCyclicUpdate(syncUrl, 10);

  const navigateToUrl = useCallback(() => {
    const iframe = getIFrame();
    if (iframe) {
      const fulfilledUrl = new URL(url, window.location.origin).toString();
      iframe?.contentWindow?.location.replace(fulfilledUrl);
    }
    setIsOverridingUrl(false);
  }, [getIFrame, url]);

  const changeUrl = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsOverridingUrl(true);
    // Set the url to the full url and fallback to the origin of the current window.

    setUrl(e.target.value);
  }, []);

  const reloadIFrame = useCallback(() => {
    const iframe = getIFrame();
    if (iframe) {
      iframe.contentWindow?.location.reload();
    }
  }, [getIFrame]);

  const [canNavigateBack, setCanNavigateBack] = useState(false);
  const checkCanNavigateBack = useCallback(() => {
    const iframe = getIFrame();
    if (iframe) {
      setCanNavigateBack((iframe.contentWindow?.history.length ?? 0) > 1);
    }
  }, [getIFrame]);
  useCyclicUpdate(checkCanNavigateBack, 10);

  const navigateBack = useCallback(() => {
    const iframe = getIFrame();
    if (iframe) {
      iframe.contentWindow?.history.back();
    }
  }, [getIFrame]);

  const stopLoading = useCallback(() => {
    const iframe = getIFrame();
    if (iframe) {
      iframe.contentWindow?.stop();
    }
  }, [getIFrame]);

  const [isLoading, setIsLoading] = useState(false);
  const checkIsLoading = useCallback(() => {
    const iframe = getIFrame();
    const iframeDoc = iframe
      ? iframe.contentDocument || iframe.contentWindow!.document
      : null;
    if (iframeDoc && iframeDoc.readyState === 'complete') {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [getIFrame]);
  useCyclicUpdate(checkIsLoading, 10);

  return (
    <div className="glass-body flex h-10 w-full flex-1 flex-row items-center gap-2 rounded-full bg-background/80 p-1 backdrop-blur-lg">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={navigateBack}
        disabled={!canNavigateBack}
      >
        <ArrowLeftIcon className="size-4" />
      </Button>
      <div className="relative flex-1">
        <span className="-translate-y-1/2 absolute top-1/2 left-2 font-bold text-muted-foreground text-xs tracking-wide">
          URL:
        </span>
        <Input
          className="flex h-8 w-full max-w-none flex-1 flex-row items-center rounded-full pl-10"
          inputClassName="pl-1.5 rounded-full outline-offset-0 h-6 mr-1"
          type="text"
          placeholder="URL"
          onSubmit={navigateToUrl}
          value={url.length > 0 ? url : '/'}
          onChange={changeUrl}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              navigateToUrl();
            }
          }}
        />
      </div>

      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => (isLoading ? stopLoading() : reloadIFrame())}
          >
            {isLoading && (
              <Loader2Icon className="size-8 animate-spin text-primary" />
            )}
            {!isLoading ? (
              <RefreshCwIcon className="size-4" />
            ) : (
              <SquareIcon className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 size-3 fill-current" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reload page</TooltipContent>
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

const screenSizes: Record<
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

export function ScreenSizeControl() {
  const screenSize = useKartonState((s) =>
    s.userExperience.activeLayout === Layout.MAIN &&
    s.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW
      ? s.userExperience.devAppPreview.customScreenSize
      : null,
  );
  const posthog = usePostHog();
  const setScreenSize = useKartonProcedure(
    (p) =>
      p.userExperience.mainLayout.mainLayout.devAppPreview.changeScreenSize,
  );

  const onValueChange = useCallback(
    (value: string | null) => {
      setScreenSize(value ? screenSizes[value as string]! : null);
    },
    [setScreenSize],
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger>
          <PopoverTrigger>
            <Button
              variant={screenSize ? 'primary' : 'secondary'}
              size="icon-md"
              className={cn(
                'backdrop-blur-lg transition-all',
                screenSize ? 'bg-primary' : 'bg-background/80',
              )}
            >
              <ProportionsIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Change screen size</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <PopoverTitle>Change screen size</PopoverTitle>
        <RadioGroup
          value={
            Object.entries(screenSizes).find(
              ([_, value]) => value?.presetName === screenSize?.presetName,
            )?.[0] ?? 'full-screen'
          }
          onValueChange={(value) => {
            onValueChange(value as string | null);
            posthog.capture('dev-app-preview-screen-size-changed', {
              screen_size: value,
            });
          }}
        >
          {Object.entries(screenSizes).map(([key, value]) => (
            <FormField>
              <FormFieldLabel
                htmlFor={`screen-size-${key}`}
                className="glass-body flex w-full flex-row items-center justify-between gap-4 rounded-xl py-1.5 pr-1.5 pl-3"
              >
                <FormFieldTitle>
                  {value?.presetName ?? 'Default'}
                </FormFieldTitle>
                <Radio value={key} id={`screen-size-${key}`} />
              </FormFieldLabel>
            </FormField>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}

export function FullScreenToggle() {
  const isFullScreen = useKartonState(
    (s) =>
      s.userExperience.activeLayout === Layout.MAIN &&
      s.userExperience.activeMainTab === MainTab.DEV_APP_PREVIEW &&
      s.userExperience.devAppPreview.isFullScreen,
  );
  const toggleFullScreen = useKartonProcedure(
    (p) =>
      p.userExperience.mainLayout.mainLayout.devAppPreview.toggleFullScreen,
  );

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="secondary"
          size="icon-md"
          className="bg-background/80 backdrop-blur-lg"
          onClick={() => toggleFullScreen()}
        >
          {isFullScreen ? (
            <Minimize2Icon className="size-4" />
          ) : (
            <Maximize2Icon className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isFullScreen ? 'Exit full screen' : 'Full screen'}
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
              className="bg-background/80 backdrop-blur-lg"
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
            <Button
              variant="primary"
              size="icon-sm"
              className="bg-green-600 text-green-50 dark:bg-green-700 dark:text-green-400"
              onClick={() => startApp()}
              disabled={!canStartApp}
            >
              <PlayIcon className="ml-px size-3.5 fill-current" />
            </Button>
            <Button
              variant="primary"
              size="icon-sm"
              className="bg-yellow-600 text-yellow-50 dark:bg-yellow-700 dark:text-yellow-400"
              onClick={() => restartApp()}
              disabled={!canRestartApp}
            >
              <RefreshCwIcon className="size-4" />
            </Button>
            <Button
              variant="primary"
              size="icon-sm"
              className="bg-rose-600 text-rose-50 dark:bg-rose-700 dark:text-rose-400"
              onClick={() => stopApp()}
              disabled={!canStopApp}
            >
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const _CodeShowModeToggle = () => {
  const [inCodeShowMode, setInCodeShowMode] = useState(false);

  const toggleCodeShowMode = useCallback(() => {
    setInCodeShowMode((prev) => !prev);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant={inCodeShowMode ? 'primary' : 'secondary'}
          size="icon-md"
          onClick={toggleCodeShowMode}
          className={cn(
            'backdrop-blur-lg transition-all',
            inCodeShowMode ? 'bg-primary' : 'bg-background/80',
          )}
        >
          <CodeIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Code show mode</TooltipContent>
    </Tooltip>
  );
};
