'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconDownload4FillDuo18 } from 'nucleo-ui-fill-duo-18';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { Logo } from '@/components/landing/logo';
import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';

export default function MigrateToCLI() {
  const [userOS, setUserOS] = useState<string>('your OS');
  const [downloadUrl, setDownloadUrl] = useState<string>('#');
  const [isMobile, setIsMobile] = useState(false);
  const [isOsSupported, setIsOsSupported] = useState(true);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();

    const mobileCheck =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent,
      );
    setIsMobile(mobileCheck);

    if (userAgent.includes('mac')) {
      setUserOS('macOS');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/macos/arm64',
      );
    } else if (userAgent.includes('win')) {
      setUserOS('Windows');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/win/x64',
      );
    } else if (userAgent.includes('linux')) {
      setUserOS('Linux');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/linux/deb/x86_64',
      );
    } else {
      setIsOsSupported(false);
    }
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Hero Section */}
      <section className="container relative z-10 mx-auto px-4 pt-32 pb-12">
        <div className="mx-auto max-w-2xl">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <div className="relative inline-block size-16 scale-95 overflow-hidden rounded-full shadow-lg ring-1 ring-black/20 ring-inset">
                <AnimatedGradientBackground className="absolute inset-0 size-full" />
                <Logo
                  className="absolute top-[24%] left-[24%] z-10 size-1/2 drop-shadow-xs"
                  color="white"
                />
              </div>

              <p className="mt-6 mb-3 text-lg text-muted-foreground">
                Your stagewise setup needs an upgrade
              </p>
              <h1 className="mb-6 font-bold text-2xl tracking-tight md:text-4xl">
                <span className="text-foreground">
                  Meet the stagewise browser
                </span>
              </h1>
              <p className="mx-auto mb-10 max-w-md text-muted-foreground">
                We&apos;ve rebuilt stagewise as a standalone desktop browser -
                no extension required. Download it and get a more powerful
                experience right out of the box.
              </p>

              <div className="flex flex-col items-center gap-3">
                {!isOsSupported ? (
                  <Button size="lg" variant="primary" disabled>
                    OS not supported
                  </Button>
                ) : isMobile ? (
                  <Button size="lg" variant="primary" disabled>
                    Download on Desktop
                  </Button>
                ) : (
                  <Link
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: 'primary', size: 'lg' }),
                    )}
                  >
                    Download for {userOS}
                    <IconDownload4FillDuo18 className="size-4" />
                  </Link>
                )}
                <p className="text-sm text-subtle-foreground">
                  Free to start · macOS, Windows & Linux
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Help Section */}
      <section className="container relative z-10 mx-auto border-border border-t px-4 py-16">
        <ScrollReveal delay={1}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-2 font-bold text-lg md:text-xl">Need Help?</h2>
            <p className="mb-4 text-muted-foreground text-sm">
              If you run into any issues, join our community — we&apos;re happy
              to help.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => {
                  window.parent.postMessage(
                    {
                      command: 'openDiscord',
                      url: 'https://discord.gg/gkdGsDYaKA',
                    },
                    '*',
                  );
                }}
                className="inline-flex cursor-pointer items-center gap-2 border-none bg-transparent font-medium text-primary-foreground transition-colors hover:text-hover-derived"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Join Discord
              </button>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
