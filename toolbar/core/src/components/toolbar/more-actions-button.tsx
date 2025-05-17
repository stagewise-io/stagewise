// SPDX-License-Identifier: AGPL-3.0-only
// More actions button component for the toolbar
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

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
  const minimizeCompanion = useAppState((state) => state.minimize);

  return (
    <ToolbarSection>
      <DropdownMenu>
        <DropdownMenuButton>
          <ToolbarButton>
            <Ellipsis className="size-4" />
          </ToolbarButton>
        </DropdownMenuButton>
        <DropdownMenuContent>
          <DropdownMenuButttonItem onClick={minimizeCompanion}>
            <Minimize2 className="size-4" />
            Minimize companion
          </DropdownMenuButttonItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ToolbarSection>
  );
}
