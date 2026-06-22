'use client';

import { LogoCombo } from '@stagewise/stage-ui/components/logo-combo';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

import { cn } from '@stagewise/stage-ui/lib/utils';
import { MenuIcon, XIcon, ChevronDown } from 'lucide-react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
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
        'https://dl.stagewise.io/download/stagewise/release/macos/arm64',
      );
    } else if (platform.includes('win') || ua.includes('win')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/win/x64',
      );
    } else if (platform.includes('linux') || ua.includes('linux')) {
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/linux/deb/x86_64',
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

function NavLink({
  children,
  href,
  onClick,
}: {
  children: React.ReactNode;
  href: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = href !== '/' ? pathname.startsWith(href) : pathname === href;
  const isExternal = href.startsWith('http');

  if (isExternal) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'md' }),
          'pointer-events-auto justify-start',
        )}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'md' }),
        'pointer-events-auto justify-start',
        isActive && 'font-semibold text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

function ResourcesDropdown() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const pathname = usePathname();
  const isResourcesActive = ['/docs', '/news', '/company', '/careers'].some(
    (p) => (p.startsWith('/') ? pathname.startsWith(p) : false),
  );

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="resources-dropdown"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'md' }),
          'pointer-events-auto inline-flex items-center justify-start gap-1',
          isResourcesActive && 'font-semibold text-foreground',
        )}
      >
        Resources
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          id="resources-dropdown"
          ref={contentRef}
          className={cn(
            'absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2',
            'flex min-w-36 flex-col gap-1 rounded-lg border border-border-subtle bg-background p-1.5 shadow-lg',
          )}
        >
          <NavLink href="https://docs.stagewise.io">Docs</NavLink>
          <NavLink href="/news">News</NavLink>
          <NavLink href="/company">Company</NavLink>
          <NavLink href="/careers">Careers</NavLink>
        </div>
      )}
    </div>
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
  const [resourcesOpen, setResourcesOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setResourcesOpen(false);
  }, [isOpen]);

  return (
    <div className="fixed top-0 left-0 z-[60] flex w-full justify-center bg-background/40 backdrop-blur-lg">
      <div className="z-50 w-full max-w-7xl px-4 transition-all duration-150 ease-out">
        {/* Top row: always visible */}
        <div className="flex h-14 w-full items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center" aria-label="stagewise">
            <LogoCombo size={24} />
          </Link>

          {/* Desktop nav links — centered */}
          <div className="pointer-events-none absolute inset-x-0 hidden items-center justify-center sm:flex">
            <div className="pointer-events-auto flex items-center">
              <NavLink href="/pricing">Pricing</NavLink>
              <NavLink href="/enterprise">Enterprise</NavLink>
              <ResourcesDropdown />
            </div>
          </div>

          {/* Right side: Download + Auth + hamburger */}
          <div className="flex items-center gap-2">
            <NavbarAuthLink />
            <NavDownloadButton />
            <Button
              variant="ghost"
              size="icon-md"
              onClick={() => setIsOpen((prev) => !prev)}
              className="sm:hidden"
              aria-label={
                isOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              aria-expanded={isOpen}
              aria-controls="mobile-navigation-menu"
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
          <>
            {/* Backdrop overlay — closes menu on outside click */}
            <div
              className="fixed inset-0 top-14 z-40 sm:hidden"
              onClick={() => setIsOpen(false)}
            />
            <div
              id="mobile-navigation-menu"
              className="relative z-50 -mx-4 flex flex-col items-start gap-1 border-border border-t border-b bg-background px-4 pb-3 shadow-lg sm:hidden"
            >
              <NavLink href="/pricing" onClick={() => setIsOpen(false)}>
                Pricing
              </NavLink>
              <NavLink href="/enterprise" onClick={() => setIsOpen(false)}>
                Enterprise
              </NavLink>
              <button
                type="button"
                onClick={() => setResourcesOpen((v) => !v)}
                aria-expanded={resourcesOpen}
                aria-controls="mobile-resources"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'md' }),
                  'inline-flex w-full items-center justify-between',
                )}
              >
                Resources
                <ChevronDown
                  className={cn(
                    'size-3.5 transition-transform',
                    resourcesOpen && 'rotate-180',
                  )}
                />
              </button>
              {resourcesOpen && (
                <div
                  id="mobile-resources"
                  className="flex w-full flex-col gap-1 border-border/50 border-l pl-4"
                >
                  <NavLink
                    href="https://docs.stagewise.io"
                    onClick={() => setIsOpen(false)}
                  >
                    Docs
                  </NavLink>
                  <NavLink href="/news" onClick={() => setIsOpen(false)}>
                    News
                  </NavLink>
                  <NavLink href="/company" onClick={() => setIsOpen(false)}>
                    Company
                  </NavLink>
                  <NavLink href="/careers" onClick={() => setIsOpen(false)}>
                    Careers
                  </NavLink>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
