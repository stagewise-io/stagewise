import type { Preview } from '@storybook/react-vite';
import React from 'react';
import { themes } from 'storybook/theming';
import '../src/ui/app.css';
import { DocsContainer } from '@storybook/addon-docs/blocks';
import { useEffect, useState } from 'react';
import { addons } from 'storybook/preview-api';
import { DARK_MODE_EVENT_NAME } from '@vueless/storybook-dark-mode';

const channel = addons.getChannel();

// Custom DocsContainer that responds to dark mode
function ThemedDocsContainer({ children, context }: any) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    channel.on(DARK_MODE_EVENT_NAME, setIsDark);
    return () => channel.off(DARK_MODE_EVENT_NAME, setIsDark);
  }, []);

  return (
    <DocsContainer
      theme={isDark ? themes.dark : themes.light}
      context={context}
    >
      {children}
    </DocsContainer>
  );
}

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const isInDocs = context.viewMode === 'docs';

      if (isInDocs) {
        // In docs mode, just apply background without fixed positioning
        return (
          <div className="rounded-lg bg-background p-4 transition-colors">
            <Story />
          </div>
        );
      }

      // In canvas/story mode, use fixed positioning to cover entire viewport
      return (
        <div className="fixed inset-0 overflow-auto bg-background transition-colors">
          <div className="p-4">
            <Story />
          </div>
        </div>
      );
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    darkMode: {
      // Override the default dark theme
      dark: { ...themes.dark, appBg: '#000000' },
      // Override the default light theme
      light: { ...themes.light, appBg: '#ffffff' },
      // Set the initial theme (defaults to light)
      current: 'light',
      // Apply dark class to html element for Tailwind dark mode
      darkClass: 'dark',
      lightClass: 'light',
      classTarget: 'html',
      // Apply classes to the preview iframe
      stylePreview: true,
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#151c2a' },
      ],
    },
    docs: {
      container: ThemedDocsContainer,
    },
  },
};

export default preview;
