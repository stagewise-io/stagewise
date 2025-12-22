import { createRootRoute, Outlet, HeadContent } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { Logo } from '@ui/components/ui/logo';
import { AnimatedGradientBackground } from '@ui/components/ui/animated-gradient-background';
import {
  IconGearFillDuo18,
  IconUserSettingsFillDuo18,
  IconHistoryFillDuo18,
  IconBroomFillDuo18,
  IconRobotFillDuo18,
} from 'nucleo-ui-fill-duo-18';
import { SidebarNav } from '@/components/sidebar-nav';

const RootLayout = () => (
  <>
    <HeadContent />
    <div className="flex h-screen w-screen items-center justify-center bg-muted p-3">
      <div className="flex h-full w-full flex-row items-start justify-start gap-6">
        <div className="flex h-full min-w-fit max-w-64 basis-1/4 flex-col items-start justify-start gap-2 py-2 pl-2">
          <div className="mt-2 flex flex-row items-center justify-start gap-4 dark:drop-shadow-md">
            <div className="glass-body -ml-0.5 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <AnimatedGradientBackground className="absolute inset-0 z-0 size-full" />
              <Logo
                color="white"
                className="z-10 mr-px mb-px size-1/2 shadow-2xs"
              />
            </div>
          </div>
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
            <hr className="ml-1 border-zinc-500/50" />
            <SidebarNav.Group label="Browsing data">
              <SidebarNav.Item
                to="/history"
                icon={<IconHistoryFillDuo18 className="size-5" />}
              >
                History
              </SidebarNav.Item>
              <SidebarNav.Item
                to="/clear-data"
                icon={<IconBroomFillDuo18 className="size-5" />}
              >
                Clear data
              </SidebarNav.Item>
            </SidebarNav.Group>
          </SidebarNav>
        </div>
        <div className="scrollbar-thin h-full flex-1 overflow-y-auto rounded-lg bg-background">
          <Outlet />
        </div>
      </div>
      <TanStackRouterDevtools />
    </div>
  </>
);

export const Route = createRootRoute({ component: RootLayout });
