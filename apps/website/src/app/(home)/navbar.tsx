'use client';

import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';
import { Logo } from '@/components/landing/logo';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

import { cn } from '@stagewise/stage-ui/lib/utils';
import { MenuIcon, XIcon } from 'lucide-react';
import {
  IconUserSettingsFillDuo18,
  IconDownload4FillDuo18,
} from 'nucleo-ui-fill-duo-18';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

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
        buttonVariants({ variant: 'ghost', size: 'md' }),
        'pointer-events-auto',
        isActive && 'font-semibold text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('#');
  const [isMobile, setIsMobile] = useState(false);
  const [isOsSupported, setIsOsSupported] = useState(true);

  // Detect user OS and set download URL
  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();

    // Detect mobile devices
    const mobileCheck =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent,
      );
    setIsMobile(mobileCheck);

    if (platform.includes('mac') || userAgent.includes('mac')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/beta/macos/arm64',
      );
    } else if (platform.includes('win') || userAgent.includes('win')) {
      setDownloadUrl('https://dl.stagewise.io/download/stagewise/beta/win/x64');
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/beta/linux/deb/x86_64',
      );
    } else {
      setIsOsSupported(false);
    }
  }, []);

  return (
    <div className="fixed top-0 left-0 z-50 flex w-full justify-center bg-background/80 backdrop-blur-lg">
      <div
        className={cn(
          'z-50 flex h-14 w-full max-w-6xl flex-col items-start justify-between gap-2 overflow-hidden px-4 py-3 transition-all duration-150 ease-out sm:h-14 sm:flex-row sm:items-center sm:py-0',
          isOpen &&
            'h-[calc-size(auto,size)] h-auto border-zinc-200 border-b shadow-sm dark:border-zinc-800',
        )}
      >
        <div className="flex w-full items-center justify-between sm:w-24">
          <Link
            href="/"
            className="relative size-10 scale-100 cursor-pointer overflow-hidden rounded-full shadow-md ring-1 ring-black/20 ring-inset"
          >
            <AnimatedGradientBackground className="pointer-events-none absolute inset-0 size-full" />
            <Logo
              className="pointer-events-none absolute top-[24%] left-[24%] z-10 size-1/2 drop-shadow-xs"
              color="white"
            />
          </Link>
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
        <div className="flex flex-col items-start justify-start sm:pointer-events-none sm:absolute sm:inset-x-0 sm:flex-row sm:items-center sm:justify-center">
          <NavbarButton href="/pricing">Pricing</NavbarButton>
          <NavbarButton href="/docs">Docs</NavbarButton>
          <NavbarButton href="/news">News</NavbarButton>
          <NavbarButton href="/team">Team</NavbarButton>
        </div>
        <div className="flex flex-row items-center justify-end gap-2">
          <Link
            href="https://console.stagewise.io"
            className={buttonVariants({
              size: 'sm',
              variant: 'secondary',
            })}
          >
            Account
            <IconUserSettingsFillDuo18 className="size-4" />
          </Link>
          {!isMobile && isOsSupported && (
            <Link
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: 'sm', variant: 'primary' })}
            >
              Download
              <IconDownload4FillDuo18 className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
