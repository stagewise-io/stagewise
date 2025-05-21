'use client';

import type { ToolbarPlugin } from '@stagewise/toolbar';
import { A11yComponent } from './component';

export const A11yPlugin: ToolbarPlugin = {
  displayName: 'A11y',
  pluginName: 'a11y',
  description: 'Accessibility Checker',
  iconSvg: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="lucide lucide-person-standing-icon lucide-person-standing"
    >
      <circle cx="12" cy="5" r="1" />
      <path d="m9 20 3-6 3 6" />
      <path d="m6 8 6 2 6-2" />
      <path d="M12 10v4" />
    </svg>
  ),
  onActionClick: () => <A11yComponent />,
};
