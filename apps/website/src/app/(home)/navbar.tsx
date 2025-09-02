'use client';

import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';
import { Logo } from '@/components/landing/logo';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { MenuIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
        'rounded-full px-5 font-normal text-muted-foreground hover:bg-zinc-500/5',
        isActive && 'font-semibold text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="-translate-x-1/2 fixed top-4 left-1/2 z-50 w-full px-4 sm:w-fit">
      <div
        className={cn(
          'glass-body z-50 flex h-14 w-full max-w-2xl flex-col items-start justify-between gap-2 overflow-hidden rounded-3xl bg-white/60 p-2 shadow-black/5 shadow-xl backdrop-blur-md transition-all duration-150 ease-out sm:h-14 sm:w-fit sm:flex-row sm:items-center sm:rounded-full dark:bg-zinc-900/60 dark:shadow-white/5',
          isOpen && 'h-[calc-size(auto,size)] h-auto',
        )}
      >
        <div className="flex w-full items-center justify-between sm:w-24">
          <div className="relative size-10 scale-100 overflow-hidden rounded-full shadow-lg ring-1 ring-black/20 ring-inset">
            <AnimatedGradientBackground className="absolute inset-0 size-full" />
            <Logo
              className="absolute top-[24%] left-[24%] z-10 size-1/2 drop-shadow-xs"
              color="white"
            />
          </div>
          <Button
            variant="secondary"
            size="icon-md"
            onClick={() => setIsOpen((prev) => !prev)}
            className="sm:hidden"
          >
            {isOpen ? (
              <XIcon className="size-4" />
            ) : (
              <MenuIcon className="size-4" />
            )}
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-start justify-start sm:flex-row sm:items-center">
          <NavbarButton href="/">Home</NavbarButton>
          <NavbarButton href="/pricing">Pricing</NavbarButton>
          <NavbarButton href="/docs">Docs</NavbarButton>
          <NavbarButton href="/news">News</NavbarButton>
        </div>
        <div className="flex w-24 flex-row items-center justify-end gap-2">
          <Link
            className={buttonVariants({
              size: 'icon-md',
              variant: 'secondary',
            })}
            href="https://x.com/stagewise_io"
          >
            <SiX className="size-5" />
          </Link>
          <Link
            className={buttonVariants({
              size: 'icon-md',
              variant: 'secondary',
            })}
            href="https://discord.gg/stagewise"
          >
            <SiDiscord className="size-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
