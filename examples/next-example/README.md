# Stagewise Toolbar Next.js Example

This example demonstrates how to integrate the Stagewise toolbar into a Next.js project.

## Installation

1. Install the Stagewise toolbar package:
```bash
npm install @stagewise/toolbar
# or
yarn add @stagewise/toolbar
# or
pnpm add @stagewise/toolbar
```

## Integration Steps

1. Create a toolbar wrapper component (`src/components/stagewise/toolbar-wrapper.tsx`):
```ts
'use client';
import type { ToolbarConfig } from '@stagewise/toolbar';
export type { ToolbarConfig };
import { initToolbar } from '@stagewise/toolbar';
import { useEffect, useRef } from 'react';

export default function ToolbarWrapper({ config }: { config: ToolbarConfig }) {
  const isLoaded = useRef(false);
  useEffect(() => {
    if (isLoaded.current) return;
    isLoaded.current = true;
    initToolbar(config);
  }, []);
  return null;
}
```

2. Create a toolbar loader component (`src/components/stagewise/toolbar-loader.tsx`):
```ts
'use client';

import dynamic from 'next/dynamic';
import type { ToolbarConfig } from './toolbar-wrapper';

const ToolbarWrapper = dynamic(() => import('./toolbar-wrapper'), {
  ssr: false,
});

const stagewiseConfig: ToolbarConfig = {
  plugins: [
    {
      name: 'react',
      description: 'Adds context for React components',
      shortInfoForPrompt: () => {
        return "The selected component is a React component. It's called 'blablub'. It's inside XY.";
      },
      mcp: null,
      actions: [
        {
          name: 'Show alert',
          description:
            "Shows an alert with the message 'Ich bin eine custom action!'",
          execute: () => {
            window.alert('Ich bin eine custom action!');
          },
        },
      ],
    },
  ],
};

export default function StagewiseToolbar() {
  return <ToolbarWrapper config={stagewiseConfig} />;
}
```

3. Add the toolbar to your layout (`src/app/layout.tsx`):
```ts
import type { Metadata } from 'next';
import './globals.css';
import StagewiseToolbar from '@/components/stagewise/toolbar-loader';

export const metadata: Metadata = {
  title: 'Create Next App',
  description: 'Generated by create next app',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <StagewiseToolbar />
        {children}
      </body>
    </html>
  );
}
```

## Important Notes

- The toolbar is client-side only and won't work during SSR
- We use Next.js's `dynamic` import with `ssr: false` to ensure the toolbar only loads in the browser
- The `'use client'` directive is required for client-side components
- Customize the `stagewiseConfig` object to add your own plugins and actions

## Development

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

## Building for Production

```bash
npm run build
# or
yarn build
# or
pnpm build
```

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
