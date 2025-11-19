import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { cn } from '@/utils';
import { LogoMenu } from './_components/logo-menu';
import { UserStatusArea } from './_components/user-status';
import { WorkspaceInfoBadge } from './_components/workspace-info';
import { MessageCircleWarningIcon } from 'lucide-react';
import { buttonVariants } from '@stagewise/stage-ui/components/button';

export function SidebarTopSection({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className="flex shrink-0 flex-row items-center justify-start gap-2 p-4 group-data-[collapsed=true]:flex-col group-data-[collapsed=true]:items-center group-data-[collapsed=true]:gap-6">
      <LogoMenu />
      <WorkspaceInfoBadge isCollapsed={isCollapsed} />
      <div className="flex-1 group-data-[collapsed=true]:hidden" />
      <div className="glass-body ml-1 @[300px]:inline-flex hidden shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
        Beta
      </div>
      <Tooltip>
        <TooltipTrigger>
          <a
            href="https://github.com/stagewise-io/stagewise/issues/new"
            target="_blank"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
              '@[300px]:inline-flex hidden shrink-0',
            )}
          >
            <MessageCircleWarningIcon className="size-4 text-muted-foreground" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Report an issue</TooltipContent>
      </Tooltip>
      <UserStatusArea />
    </div>
  );
}
