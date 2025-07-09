import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import StagewiseLogo from './logo.svg';
import StagewiseLogoWhite from './logo-white.svg';
import { SiDiscord, SiGithub, SiX } from 'react-icons/si';
import { HeaderAuth } from '@/components/layout/header-auth';
import { Button } from '@stagewise/ui/components/button';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <Image
          src={StagewiseLogo}
          alt="Logo"
          height={32}
          className="dark:hidden"
        />
        <Image
          src={StagewiseLogoWhite}
          alt="Logo"
          height={32}
          className="hidden dark:block"
        />
      </>
    ),
  },
  links: [
    {
      text: 'Documentation',
      url: '/docs',
      active: 'nested-url',
    },
    // TODO: Uncomment this when we officially launch the waitlist
    // {
    //   text: 'Waitlist',
    //   url: '/waitlist',
    //   active: 'nested-url',
    // },
    {
      type: 'custom',
      children: (
        <a
          href="https://discord.gg/9dy3YSE8"
          target="_blank"
          className="ml-8"
          rel="noreferrer noopener"
          aria-label="Discord"
        >
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <SiDiscord className="h-5 w-5" />
            <span className="sr-only">Discord</span>
          </Button>
        </a>
      ),
      secondary: true,
    },
    {
      type: 'custom',
      children: (
        <a
          href="https://x.com/stagewise_io"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="X"
        >
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <SiX className="h-5 w-5" />
            <span className="sr-only">X</span>
          </Button>
        </a>
      ),
      secondary: true,
    },
    {
      type: 'custom',
      children: (
        <a
          href="https://github.com/stagewise-io/stagewise"
          target="_blank"
          className="mr-8"
          rel="noreferrer noopener"
          aria-label="GitHub"
        >
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <SiGithub className="h-5 w-5" />
            <span className="sr-only">GitHub</span>
          </Button>
        </a>
      ),
      secondary: true,
    },
    {
      type: 'custom',
      children: <HeaderAuth />,
      secondary: true,
    },
  ],
};
