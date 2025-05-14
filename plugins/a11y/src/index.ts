'use client';

import type { ToolbarPlugin } from '@stagewise/toolbar';
import { ToolbarAction } from './ui/actionButton';
import './style.css';
export const A11yPlugin: ToolbarPlugin = {
  displayName: 'A11y',
  description: 'Accessibility Checker',
  iconSvg: null,
  promptContextName: 'a11y',

  onLoad: (toolbar) => {
    toolbar.renderToolbarAction(ToolbarAction);
  },
};
