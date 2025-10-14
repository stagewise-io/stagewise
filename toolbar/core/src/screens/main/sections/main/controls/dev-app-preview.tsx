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
import {
  PlayIcon,
  Maximize2Icon,
  ProportionsIcon,
  CodeIcon,
  Minimize2Icon,
} from 'lucide-react';
import { useCallback, useState } from 'react';

export function DevAppPreviewControls() {
  return (
    <div className="flex flex-row-reverse items-center gap-2">
      <DevAppStateInfo />
      <FullScreenToggle />
      <ScreenSizeControl />
      <CodeShowModeToggle />
    </div>
  );
}

export function ScreenSizeControl() {
  const [changedScreenSize, _setChangedScreenSize] = useState(false);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger>
          <PopoverTrigger>
            <Button
              variant={changedScreenSize ? 'primary' : 'secondary'}
              size="icon-md"
              className="transition-all"
            >
              <ProportionsIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Change screen size</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <PopoverTitle>Change screen size</PopoverTitle>
      </PopoverContent>
    </Popover>
  );
}

export function FullScreenToggle() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const toggleFullScreen = useCallback(
    () => setIsFullScreen((prev) => !prev),
    [],
  );

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button variant="secondary" size="icon-md" onClick={toggleFullScreen}>
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
  const [_contentOnPort, _setContentOnPort] = useState(false);
  const [_hostingApp, _setHostingApp] = useState(false);
  const [_hostedAppRunning, setHostedAppRunning] = useState(false);

  const startHostedApp = useCallback(() => {
    setHostedAppRunning(true);
  }, []);

  const stopHostedApp = useCallback(() => {
    setHostedAppRunning(false);
  }, []);

  const _restartHostedApp = useCallback(() => {
    stopHostedApp();
    startHostedApp();
  }, [startHostedApp, stopHostedApp]);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger>
          <PopoverTrigger>
            <Button variant="secondary" size="icon-md">
              <PlayIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Dev App Server Status</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <PopoverTitle>Dev App Server Status</PopoverTitle>
      </PopoverContent>
    </Popover>
  );
}

const CodeShowModeToggle = () => {
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
          className="transition-all"
        >
          <CodeIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Code show mode</TooltipContent>
    </Tooltip>
  );
};
