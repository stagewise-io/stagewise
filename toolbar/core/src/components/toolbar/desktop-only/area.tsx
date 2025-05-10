// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar area component for the desktop
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

import { ToolbarDraggableBox } from './draggable-box';
import { useRef } from 'preact/hooks';
import { DraggableProvider } from '@/hooks/use-draggable';

export function ToolbarArea() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="absolute size-full">
      <div className="absolute inset-4" ref={containerRef}>
        <DraggableProvider
          containerRef={containerRef}
          snapAreas={{
            topLeft: true,
            topCenter: true,
            topRight: true,
            centerLeft: true,
            center: true,
            centerRight: true,
            bottomLeft: true,
            bottomCenter: true,
            bottomRight: true,
          }}
        >
          <ToolbarDraggableBox />
        </DraggableProvider>
      </div>
    </div>
  );
}
