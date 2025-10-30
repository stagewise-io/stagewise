import { LogoMenu } from './_components/logo-menu';
import { UserStatusArea } from './_components/user-status';
import { WorkspaceInfoBadge } from './_components/workspace-info';

export function SidebarTopSection({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className="flex shrink-0 flex-row items-center justify-start gap-2 p-4 group-data-[collapsed=true]:flex-col group-data-[collapsed=true]:items-center group-data-[collapsed=true]:gap-6">
      <LogoMenu />
      <WorkspaceInfoBadge isCollapsed={isCollapsed} />
      <div className="flex-1 group-data-[collapsed=true]:hidden" />
      <UserStatusArea />
    </div>
  );
}
