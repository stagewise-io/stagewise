// SPDX-License-Identifier: AGPL-3.0-only
// Element selector component for the toolbar
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

// This component watches the whole page area for a click of the user and uses the provided callback to return
// information about the element that was hovered or clicked.
// It ignores the companion itself.

import { getElementAtPoint } from '@/utils';
import { useCallback, useRef } from 'preact/hooks';
import type { MouseEventHandler } from 'preact/compat';

export interface ElementSelectorProps {
  onElementHovered: (element: HTMLElement) => void;
  onElementUnhovered: () => void;
  onElementSelected: (element: HTMLElement) => void;
  ignoreList: HTMLElement[];
}

export function ElementSelector(props: ElementSelectorProps) {
  const lastHoveredElement = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.companion')) return;
      const refElement = getElementAtPoint(event.clientX, event.clientY);
      if (props.ignoreList.includes(refElement)) return;
      if (lastHoveredElement.current !== refElement) {
        lastHoveredElement.current = refElement;
        props.onElementHovered(refElement);
      }
    },
    [props],
  );

  const handleMouseLeave = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(() => {
    lastHoveredElement.current = null;
    props.onElementUnhovered();
  }, [props]);

  const handleMouseClick = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(() => {
    if (!lastHoveredElement.current) return;
    if (props.ignoreList.includes(lastHoveredElement.current)) return;
    props.onElementSelected(lastHoveredElement.current);
  }, [props]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 h-screen w-screen"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleMouseClick}
      role="button"
      tabIndex={0}
    />
  );
}
