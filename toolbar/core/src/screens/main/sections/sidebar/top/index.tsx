import { LogoMenu } from './_components/logo-menu';
import { UserStatusArea } from './_components/user-status';
import { WorkspaceInfoBadge } from './_components/workspace-info';

export function SidebarTopSection() {
  return (
    <div className="flex shrink-0 flex-row items-center justify-start gap-2 p-4">
      <LogoMenu />
      <WorkspaceInfoBadge />
      <div className="flex-1" />
      <UserStatusArea />
    </div>
  );
}
