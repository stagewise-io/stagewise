import {
  createRootRoute,
  Outlet,
  HeadContent,
  useLocation,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { Logo } from '@ui/components/ui/logo';
import { AnimatedGradientBackground } from '@ui/components/ui/animated-gradient-background';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  IconGearFillDuo18,
  IconUserSettingsFillDuo18,
  IconHistoryFillDuo18,
  IconBroomFillDuo18,
  IconRobotFillDuo18,
  IconDownloadFillDuo18,
  IconCircleInfoFillDuo18,
} from 'nucleo-ui-fill-duo-18';
import { IconGithub, IconLinkedin, IconDiscord } from 'nucleo-social-media';
import { SidebarNav } from '@/components/sidebar-nav';

// Routes that should be displayed without the sidebar (standalone view)
const STANDALONE_ROUTES = ['/diff-review', '/auth'];

const RootLayout = () => {
  const location = useLocation();

  // Check if the current route is a standalone route (no sidebar)
  const isStandaloneRoute = STANDALONE_ROUTES.some((route) =>
    location.pathname.startsWith(route),
  );

  // Standalone layout (no sidebar)
  if (isStandaloneRoute) {
    return (
      <>
        <HeadContent />
        <div className="flex h-screen w-screen items-center justify-center bg-muted/50 p-3">
          <div className="scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent hover:scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 dark:hover:scrollbar-thumb-zinc-500 h-full w-full overflow-y-auto rounded-lg bg-background ring-1 ring-muted-foreground/20">
            <Outlet />
          </div>
          <TanStackRouterDevtools />
        </div>
      </>
    );
  }

  // Default layout with sidebar
  return (
    <>
      <HeadContent />
      <div className="flex h-screen w-screen items-center justify-center bg-muted/50 p-3">
        <div className="flex h-full w-full flex-row items-start justify-start gap-6">
          <div className="flex h-full min-w-fit max-w-64 basis-1/4 flex-col items-start justify-between gap-2 py-2 pl-2">
            <div className="flex flex-row items-center justify-start gap-4 dark:drop-shadow-md">
              <div className="glass-body -ml-0.5 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <AnimatedGradientBackground className="absolute inset-0 z-0 size-full" />
                <Logo
                  color="white"
                  className="z-10 mr-px mb-px size-1/2 shadow-2xs"
                />
              </div>
            </div>
            <div className="mt-6 flex w-full flex-1 flex-col items-start justify-start">
              <SidebarNav>
                <SidebarNav.Group label="Settings">
                  <SidebarNav.Item
                    to="/browsing-settings"
                    icon={<IconGearFillDuo18 className="size-5" />}
                  >
                    Browsing settings
                  </SidebarNav.Item>
                  <SidebarNav.Item
                    to="/agent-settings"
                    icon={<IconRobotFillDuo18 className="size-5" />}
                  >
                    Agent settings
                  </SidebarNav.Item>
                  <SidebarNav.Item
                    to="/account"
                    icon={<IconUserSettingsFillDuo18 className="size-5" />}
                  >
                    Account
                  </SidebarNav.Item>
                </SidebarNav.Group>
                <hr className="ml-1 border-border/30" />
                <SidebarNav.Group label="Browsing data">
                  <SidebarNav.Item
                    to="/history"
                    icon={<IconHistoryFillDuo18 className="size-5" />}
                  >
                    History
                  </SidebarNav.Item>
                  <SidebarNav.Item
                    to="/downloads"
                    icon={<IconDownloadFillDuo18 className="size-5" />}
                  >
                    Downloads
                  </SidebarNav.Item>
                  <SidebarNav.Item
                    to="/clear-data"
                    icon={<IconBroomFillDuo18 className="size-5" />}
                  >
                    Clear data
                  </SidebarNav.Item>
                </SidebarNav.Group>
                <hr className="ml-1 border-border/30" />
                <SidebarNav.Item
                  to="/about"
                  icon={<IconCircleInfoFillDuo18 className="size-5" />}
                >
                  About
                </SidebarNav.Item>
              </SidebarNav>
            </div>
            <div className="mb-4 flex w-full flex-row items-center justify-start gap-3">
              <Tooltip>
                <TooltipTrigger>
                  <a
                    href="https://stagewise.io/socials/x"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="X (Twitter)"
                  >
                    𝕏
                  </a>
                </TooltipTrigger>
                <TooltipContent>X (Twitter)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <a
                    href="https://stagewise.io/socials/linkedin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="LinkedIn"
                  >
                    <IconLinkedin className="size-5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>LinkedIn</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <a
                    href="https://stagewise.io/socials/discord"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Discord"
                  >
                    <IconDiscord className="size-5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Discord</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <a
                    href="https://github.com/stagewise-io/stagewise"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="GitHub Repository"
                  >
                    <IconGithub className="size-5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>GitHub Repository</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent hover:scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 dark:hover:scrollbar-thumb-zinc-500 h-full flex-1 overflow-y-auto rounded-lg bg-background ring-1 ring-muted-foreground/20">
            <Outlet />
          </div>
        </div>
        <TanStackRouterDevtools />
      </div>
    </>
  );
};

export const Route = createRootRoute({ component: RootLayout });
