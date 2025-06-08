import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import StagewiseLogo from './logo.svg';
import StagewiseLogoWhite from './logo-white.svg';
import { SiDiscord, SiGithub, SiX } from 'react-icons/si';
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
    {
      type: 'icon',
      label: 'Discord', // `aria-label`
      icon: <SiDiscord className="m-1 size-4" />,
      text: 'Discord',
      url: 'https://discord.gg/9dy3YSE8',
    },
    {
      type: 'icon',
      label: 'X', // `aria-label`
      icon: <SiX className="m-1 size-4" />,
      text: 'X',
      url: 'https://x.com/stagewise_io',
    },
    {
      type: 'icon',
      label: 'GitHub', // `aria-label`
      icon: <SiGithub className="m-1 size-4" />,
      text: 'itHub',
      url: 'https://github.com/stagewise-io/stagewise',
    },
  ],
};
