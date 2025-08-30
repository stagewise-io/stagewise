import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { SiDiscord, SiGithub, SiX } from 'react-icons/si';
import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';
import { Logo } from '@/components/landing/logo';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  searchToggle: {
    enabled: false,
  },
  themeSwitch: {
    enabled: true,
  },
  nav: {
    title: (
      <>
        <div className="relative size-10 scale-95 overflow-hidden rounded-full shadow-lg ring-1 ring-black/20 ring-inset">
          <AnimatedGradientBackground className="absolute inset-0 size-full" />
          <Logo
            className="absolute top-[24%] left-[24%] z-10 size-1/2 drop-shadow-xs"
            color="white"
          />
        </div>
      </>
    ),
    transparentMode: 'top',
  },
  links: [
    {
      text: 'Docs',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'Team',
      url: '/team',
      active: 'nested-url',
    },
    {
      text: 'Newsroom',
      url: '/news',
      active: 'nested-url',
    },
    // TODO: Uncomment this when we officially launch the waitlist
    // {
    //   text: 'Waitlist',
    //   url: '/waitlist',
    //   active: 'nested-url',
    // },
    {
      type: 'icon',
      label: 'Discord', // `aria-label`
      icon: <SiDiscord className="m-1 size-4" />,
      text: 'Discord',
      url: 'https://discord.gg/gkdGsDYaKA',
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
