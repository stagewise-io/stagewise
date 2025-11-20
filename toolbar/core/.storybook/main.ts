import type { StorybookConfig } from '@storybook/react-vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/stage-ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
    '@vueless/storybook-dark-mode',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    const { mergeConfig } = await import('vite');
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: [
          // More specific aliases must come first
          // Catch absolute imports with @ prefix
          {
            find: /^@\/hooks\/use-karton$/,
            replacement: path.resolve(__dirname, './mocks/mock-hooks.tsx'),
          },
          {
            find: /^@\/hooks\/use-chat-state$/,
            replacement: path.resolve(__dirname, './mocks/mock-hooks.tsx'),
          },
          {
            find: /^@\/hooks\/use-context-chip-hover$/,
            replacement: path.resolve(__dirname, './mocks/mock-hooks.tsx'),
          },
          // Catch relative imports (safety net)
          {
            find: /src\/hooks\/use-karton$/,
            replacement: path.resolve(__dirname, './mocks/mock-hooks.tsx'),
          },
          {
            find: /hooks\/use-karton$/,
            replacement: path.resolve(__dirname, './mocks/mock-hooks.tsx'),
          },
          // Standard @ alias (must come last)
          { find: '@', replacement: path.resolve(__dirname, '../src') },
        ],
      },
      define: {
        'process.env.POSTHOG_API_KEY': JSON.stringify(undefined),
        'process.env.POSTHOG_HOST': JSON.stringify('https://eu.i.posthog.com'),
      },
    });
  },
  previewHead: (head) => `
    ${head}
  <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap" rel="stylesheet">
    <style>
      :root {
        font-family: 'Geist', sans-serif;
        font-optical-sizing: auto;
        font-style: normal;
      }
    </style>
  `,
};
export default config;
