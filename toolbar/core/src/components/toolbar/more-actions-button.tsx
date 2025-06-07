import { Ellipsis, Minimize2 } from 'lucide-react';
import {
  DropdownMenuButton,
  DropdownMenuButttonItem,
  DropdownMenuContent,
} from '../ui/dropdown-menu';
import { DropdownMenu } from '../ui/dropdown-menu';
import { ToolbarButton } from './button';
import { useAppState } from '@/hooks/use-app-state';
import { ToolbarSection } from './section';

export function ToolbarMoreActionsButton() {
  const { minimize } = useAppState();

  return (
    <ToolbarSection>
      <DropdownMenu>
        <DropdownMenuButton>
          <ToolbarButton>
            <Ellipsis className="size-4" />
          </ToolbarButton>
        </DropdownMenuButton>
        <DropdownMenuContent>
          <DropdownMenuButttonItem onClick={minimize}>
            <Minimize2 className="size-4" />
            Minimize companion
          </DropdownMenuButttonItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ToolbarSection>
  );
}
