'use client';

import type { ToolbarPlugin } from '@stagewise/toolbar';

export const ExamplePlugin: ToolbarPlugin = {
  displayName: 'Example',
  description: 'Example Plugin',
  iconSvg: null,
  promptContextName: 'example',

  toolbarAction: {
    onClick: async (context) => {
      alert('Example plugin clicked');
      context.sendPrompt('Tell the user the stagewise plugin is working');
    },
  },
};
