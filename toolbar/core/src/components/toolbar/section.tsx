// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar section component
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

import type { ComponentChildren } from 'preact';

export function ToolbarSection({ children }: { children?: ComponentChildren }) {
  return (
    <div className="fade-in slide-in-from-right-2 flex max-h-sm max-w-full animate-in snap-start flex-col items-center justify-between gap-1 py-0.5">
      {children}
    </div>
  );
}
