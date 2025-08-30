'use client';

import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';
import { Logo } from '@/components/landing/logo';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SiDiscord, SiX } from 'react-icons/si';

function NavbarButton({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  const pathname = usePathname();
  const isActive = href !== '/' ? pathname.startsWith(href) : pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'lg' }),
        'rounded-full font-normal text-muted-foreground hover:bg-zinc-500/5',
        isActive && 'font-semibold text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  return (
    <div className="glass-body fixed top-4 z-50 flex h-14 w-fit max-w-2xl flex-row items-center justify-between gap-2 rounded-full bg-white/60 p-2 shadow-black/5 shadow-xl backdrop-blur-md dark:bg-zinc-900/60 dark:shadow-white/5">
      <div className="w-36">
        <div className="relative size-10 scale-100 overflow-hidden rounded-full shadow-lg ring-1 ring-black/20 ring-inset">
          <AnimatedGradientBackground className="absolute inset-0 size-full" />
          <Logo
            className="absolute top-[24%] left-[24%] z-10 size-1/2 drop-shadow-xs"
            color="white"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-row items-center justify-start">
        <NavbarButton href="/">Home</NavbarButton>
        <NavbarButton href="/pricing">Pricing</NavbarButton>
        <NavbarButton href="/docs">Docs</NavbarButton>
        <NavbarButton href="/news">News</NavbarButton>
      </div>
      <div className="flex w-36 flex-row items-center justify-end gap-2">
        <Link
          className={buttonVariants({ size: 'icon-md', variant: 'secondary' })}
          href="https://x.com/stagewise_io"
        >
          <SiX className="size-5" />
        </Link>
        <Link
          className={buttonVariants({ size: 'icon-md', variant: 'secondary' })}
          href="https://discord.gg/stagewise"
        >
          <SiDiscord className="size-5" />
        </Link>
      </div>
    </div>
  );
}
