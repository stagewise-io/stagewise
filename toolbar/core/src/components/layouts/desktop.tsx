// SPDX-License-Identifier: AGPL-3.0-only
// Desktop layout component for the toolbar
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

// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { ToolbarArea } from '@/components/toolbar/desktop-only/area';
import { cn } from '@/utils';
import { SelectorCanvas } from '../dom-context/selector-canvas';

export function DesktopLayout() {
  return (
    <div className={cn('fixed inset-0 h-screen w-screen')}>
      <SelectorCanvas />
      <ToolbarArea />
    </div>
  );
}
