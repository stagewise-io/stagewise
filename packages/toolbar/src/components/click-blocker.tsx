// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar click blocker component
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

import { cn } from '@/utils';

// This component creates a transparent element that blocks all clicks on the elements below it.
export function ClickBlocker(props: {
  enable?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        typeof props.enable === 'undefined' || props.enable
          ? 'pointer-events-auto'
          : 'pointer-events-none',
        props.className,
      )}
      onClick={props.onClick}
      role="button"
      tabIndex={0}
    />
  );
}
