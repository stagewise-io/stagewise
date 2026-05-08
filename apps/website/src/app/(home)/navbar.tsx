'use client';

import { LogoCombo } from '@stagewise/stage-ui/components/logo-combo';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

import { cn } from '@stagewise/stage-ui/lib/utils';
import { MenuIcon, XIcon } from 'lucide-react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { IconDownload4FillDuo18 } from 'nucleo-ui-fill-duo-18';

function NavDownloadButton() {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const platform =
      (
        navigator as Navigator & {
          userAgentData?: { platform?: string };
        }
      ).userAgentData?.platform?.toLowerCase() ?? '';
    const ua = navigator.userAgent.toLowerCase();
    const isMobile =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
    if (isMobile) return;
    if (platform.includes('mac') || ua.includes('mac')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/macos/arm64',
      );
    } else if (platform.includes('win') || ua.includes('win')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/win/x64',
      );
    } else if (platform.includes('linux') || ua.includes('linux')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/linux/deb/x86_64',
      );
    }
  }, []);

  if (!downloadUrl) return null;

  return (
    <a
      href={downloadUrl}
      className={cn(buttonVariants({ size: 'sm', variant: 'primary' }))}
    >
      Download
      <IconDownload4FillDuo18 className="size-4" />
    </a>
  );
}

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

function NavbarAuthLink() {
  const { data: session } = useSession();

  return (
    <Link
      href="https://console.stagewise.io"
      className={cn(
        buttonVariants({ size: 'sm', variant: 'ghost' }),
        'hidden sm:inline-flex',
      )}
    >
      {session?.user ? 'Account' : 'Sign in'}
    </Link>
  );
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-0 left-0 z-50 flex w-full justify-center bg-background/40 backdrop-blur-lg">
      {/* Desktop: single row, h-14. Mobile: column, height grows when open */}
      <div className="z-50 w-full max-w-7xl px-4 transition-all duration-150 ease-out">
        {/* Top row: always visible */}
        <div className="flex h-14 w-full items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center" aria-label="stagewise">
            <LogoCombo size={24} />
          </Link>

          {/* Desktop nav links (centered absolutely) */}
          <div className="pointer-events-none absolute inset-x-0 hidden items-center justify-center sm:flex">
            <div className="pointer-events-auto flex items-center">
              <NavbarButton href="https://docs.stagewise.io">Docs</NavbarButton>
              <NavbarButton href="/news">News</NavbarButton>
              <NavbarButton href="/mission">Mission</NavbarButton>
            </div>
          </div>

          {/* Right side: Download + Auth + hamburger */}
          <div className="flex items-center gap-2">
            <NavbarAuthLink />
            <NavDownloadButton />
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
        </div>

        {/* Mobile dropdown */}
        {isOpen && (
          <div className="flex flex-col items-start gap-1 border-border border-t pb-3 sm:hidden">
            <NavbarButton href="https://docs.stagewise.io">Docs</NavbarButton>
            <NavbarButton href="/news">News</NavbarButton>
            <NavbarButton href="/mission">Mission</NavbarButton>
          </div>
        )}
      </div>
    </div>
  );
}
