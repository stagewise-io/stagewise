'use client';

import type { ToolbarPlugin } from '@stagewise/toolbar';
import { ToolbarAction } from './ui/actionButton';

export const A11yPlugin: ToolbarPlugin = {
  displayName: 'A11y',
  pluginName: 'a11y',
  description: 'Accessibility Checker',
  iconSvg: 'https://www.iconpacks.net/icons/2/free-random-icon-3814-thumb.png',

  onLoad: (toolbar) => {
    toolbar.renderToolbarAction(ToolbarAction);
  },

  onPromptSend: (prompt) => {
    console.log('prompt send');
    return {
      contextSnippets: [
        {
          promptContextName: 'console-errors',
          content: 'Check the console for errors',
        },
      ],
    };
  },

  onContextElementSelect: (element) => {
    console.log('context element select', element);
    return {
      annotation: 'Check the console for errors',
    };
  },

  onPromptingStart: () => {
    return {
      contextSnippetOffers: [],
    };
  },
};
