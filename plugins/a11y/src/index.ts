'use client';

import type { ToolbarPlugin } from '@stagewise/toolbar';
import { ToolbarAction } from './ui/actionButton';

export const A11yPlugin: ToolbarPlugin = {
  displayName: 'A11y',
  description: 'Accessibility Checker',
  iconSvg: null,
  promptContextName: 'a11y',

  onLoad: (toolbar) => {
    toolbar.renderToolbarAction(ToolbarAction);
    toolbar.renderToolbarAction(ToolbarAction);
    toolbar.renderToolbarAction(ToolbarAction);
    const handle = toolbar.renderToolbarAction(ToolbarAction);

    handle.remove();
  },
};