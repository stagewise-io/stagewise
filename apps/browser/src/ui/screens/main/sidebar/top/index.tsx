import { WorkspaceInfoBadge } from './_components/workspace-info';
import { IconHistoryFill18, IconPlusFill18 } from 'nucleo-ui-fill-18';
import { Button } from '@stagewise/stage-ui/components/button';

export function SidebarTopSection({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className="ml-12 flex h-8 min-h-8 flex-row items-center justify-start gap-2 pr-2 group-data-[collapsed=true]:flex-col group-data-[collapsed=true]:items-center group-data-[collapsed=true]:gap-6">
      <WorkspaceInfoBadge isCollapsed={isCollapsed} />
      <div className="glass-body ml-1 @[350px]:inline-flex hidden shrink-0 items-center rounded-full px-2 py-0.5 font-medium text-primary text-xs">
        Alpha
      </div>
      <div className="flex-1 group-data-[collapsed=true]:hidden" />
      {!isCollapsed && (
        <div className="@[250px]:flex hidden shrink-0 flex-row items-center">
          <Button variant="ghost" size="icon-sm" className="shrink-0">
            <IconPlusFill18 className="size-4 text-foregroun" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="shrink-0">
            <IconHistoryFill18 className="size-4 text-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}
