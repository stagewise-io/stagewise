import { createFileRoute } from '@tanstack/react-router';
import { SidebarNav } from '@/components/sidebar-nav';
import {
  IconHistoryFillDuo18,
  IconBroomFillDuo18,
  IconDownloadFillDuo18,
  IconCircleInfoFillDuo18,
  IconDatabaseKeyFillDuo18,
  IconUserUpdateFillDuo18,
  IconSpace3dFillDuo18,
  IconNoteFillDuo18,
  IconGear3FillDuo18,
} from 'nucleo-ui-fill-duo-18';
import { IconLinkedin, IconDiscord, IconGithub } from 'nucleo-social-media';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Outlet } from '@tanstack/react-router';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { LogoCombo } from '@stagewise/stage-ui/components/logo-combo';

export const Route = createFileRoute('/_internal-app')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-base-100 p-3 dark:bg-base-900">
      <div className="flex h-full w-full flex-row items-start justify-start gap-6">
        <Sidebar />
        <OverlayScrollbar
          className="h-full flex-1 rounded-lg bg-background ring-1 ring-derived-strong"
          style={
            {
              '--os-scrollbar-inset-top': '8px',
              '--os-scrollbar-inset-bottom': '8px',
            } as React.CSSProperties
          }
        >
          <Outlet />
        </OverlayScrollbar>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="flex h-full min-w-fit max-w-56 basis-1/4 flex-col items-start justify-between gap-2 pt-2 pb-0 pl-2">
      <div className="flex flex-row items-center justify-start gap-4">
        <LogoCombo size={24} />
      </div>
      <div className="mt-6 flex w-full flex-1 flex-col items-start justify-start">
        <SidebarNav>
          <SidebarNav.Group label="Agent">
            <SidebarNav.Item
              to="/agent-settings/general"
              icon={<IconGear3FillDuo18 className="size-4" />}
            >
              General
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/agent-settings/models-providers"
              icon={<IconDatabaseKeyFillDuo18 className="size-4" />}
            >
              Models & Providers
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/agent-settings/skills-context"
              icon={<IconNoteFillDuo18 className="size-4" />}
            >
              Skills & Context files
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/agent-settings/plugins"
              icon={<IconSpace3dFillDuo18 className="size-4 rotate-180" />}
            >
              Plugins
            </SidebarNav.Item>
          </SidebarNav.Group>
          <hr className="ml-1 border-derived-strong bg-base-100 dark:bg-base-900" />
          <SidebarNav.Group label="Browsing">
            <SidebarNav.Item
              to="/browsing-settings"
              icon={<IconGear3FillDuo18 className="size-4" />}
            >
              General
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/history"
              icon={<IconHistoryFillDuo18 className="size-4" />}
            >
              History
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/downloads"
              icon={<IconDownloadFillDuo18 className="size-4" />}
            >
              Downloads
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/clear-data"
              icon={<IconBroomFillDuo18 className="size-4" />}
            >
              Clear data
            </SidebarNav.Item>
          </SidebarNav.Group>
          <hr className="ml-1 border-derived-strong bg-base-100 dark:bg-base-900" />
          <div className="flex w-full flex-col items-stretch justify-start gap-2">
            <SidebarNav.Item
              to="/account"
              icon={<IconUserUpdateFillDuo18 className="size-4" />}
            >
              Account
            </SidebarNav.Item>
            <SidebarNav.Item
              to="/about"
              icon={<IconCircleInfoFillDuo18 className="size-4" />}
            >
              About
            </SidebarNav.Item>
          </div>
        </SidebarNav>
      </div>
      <div className="flex w-full flex-row items-center justify-start gap-3">
        <Tooltip>
          <TooltipTrigger>
            <a
              href="https://stagewise.io/socials/x"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon-xs',
                className: 'w-min p-0 text-lg!',
              })}
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
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon-xs',
                className: 'w-min p-0 text-lg!',
              })}
              aria-label="LinkedIn"
            >
              <IconLinkedin className="size-4" />
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
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon-xs',
                className: 'w-min p-0 text-lg!',
              })}
              aria-label="Discord"
            >
              <IconDiscord className="size-4" />
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
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon-xs',
                className: 'w-min p-0 text-lg!',
              })}
              aria-label="GitHub Repository"
            >
              <IconGithub className="size-4" />
            </a>
          </TooltipTrigger>
          <TooltipContent>GitHub Repository</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
