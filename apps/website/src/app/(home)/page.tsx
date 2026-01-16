'use client';
import Link from 'next/link';

import {
  IconChatBotFillDuo18,
  IconColorPalette2FillDuo18,
  IconDownload4FillDuo18,
  IconLockFillDuo18,
  IconSparkleFillDuo18,
} from 'nucleo-ui-fill-duo-18';
import { IconGithub } from 'nucleo-social-media';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { usePostHog } from 'posthog-js/react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import agentInBrowserImage from './_components/feature-images/agent_in_browser.png';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';

function FeatureSection() {
  return (
    <section className="relative z-10 w-full py-40 md:py-48">
      <div className="flex justify-center">
        <ScrollReveal>
          <div className="mb-20 max-w-3xl pt-8 text-center">
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Built for web developers
            </h2>
            <p className="text-lg text-muted-foreground">
              Stagewise delivers a browser experience that is tailored to the
              needs of web developers.
            </p>
          </div>
        </ScrollReveal>
      </div>

      <div className="flex flex-col items-stretch gap-10 md:gap-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-4 md:flex-row md:items-center md:gap-12 md:p-6">
          <div className="space-y-4">
            <p className="text-foreground text-xl">
              No more context switching
              <br />
              <span className="text-lg text-muted-foreground">
                Prompt changes right where you see them - not in a separate code
                editor.
              </span>
            </p>
            <Link href="" className="text-primary-foreground hover:underline">
              Learn more <IconArrowRightFill18 className="inline size-4" />
            </Link>
          </div>
          <Image
            src={agentInBrowserImage}
            className="w-full shrink-0 rounded-md md:basis-2/3"
            alt="Image showing a browser with an integrated coding agent"
          />
        </div>

        <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-4 md:flex-row-reverse md:items-center md:gap-12 md:p-6">
          <div className="space-y-4">
            <p className="text-foreground text-xl">
              Efficient DevTools
              <br />
              <span className="text-lg text-muted-foreground">
                A single layer of workflow-oriented and AI-native tools.
              </span>
            </p>
            <Link href="" className="text-primary-foreground hover:underline">
              Learn more <IconArrowRightFill18 className="inline size-4" />
            </Link>
          </div>
          <Image
            src={agentInBrowserImage}
            className="w-full shrink-0 rounded-md md:basis-2/3"
            alt="Image showing a browser with an integrated coding agent"
          />
        </div>

        <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-4 md:flex-row md:items-center md:gap-12 md:p-6">
          <div className="space-y-4">
            <p className="text-foreground text-xl">
              Powerful reverse engineering tools
              <br />
              <span className="text-lg text-muted-foreground">
                Understand and re-use components, style systems and color
                palettes from any website.
              </span>
            </p>
            <Link href="" className="text-primary-foreground hover:underline">
              Learn more <IconArrowRightFill18 className="inline size-4" />
            </Link>
          </div>
          <Image
            src={agentInBrowserImage}
            className="w-full shrink-0 rounded-md md:basis-2/3"
            alt="Image showing a browser with an integrated coding agent"
          />
        </div>
      </div>
    </section>
  );
}

function ProductValuesSection() {
  return (
    <section className="relative z-10 w-full py-40 md:py-48">
      <div className="flex justify-center">
        <ScrollReveal>
          <div className="mb-20 max-w-3xl pt-8 text-center">
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Focus on what matters
            </h2>
            <p className="text-lg text-muted-foreground">
              Stagewise is a browser that focuses on what's important to you.
            </p>
          </div>
        </ScrollReveal>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-10 lg:grid-cols-4 lg:gap-4 xl:gap-10">
        <ScrollReveal>
          <div className="aspect-square rounded-lg bg-surface-1 p-4 pt-8 md:p-6 md:pt-10">
            <div className="space-y-4">
              <IconLockFillDuo18 className="size-10" />
              <p className="text-foreground text-xl">
                Privacy first
                <br />
                <span className="text-lg text-muted-foreground">
                  Your browsing history is never synced.
                </span>
              </p>
              <Link href="" className="text-primary-foreground hover:underline">
                Learn more <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="aspect-square rounded-lg bg-surface-1 p-4 pt-8 md:p-6 md:pt-10">
            <div className="space-y-4">
              <IconChatBotFillDuo18 className="size-10" />
              <p className="text-foreground text-xl">
                Powerful agent
                <br />
                <span className="text-lg text-muted-foreground">
                  Coding, debugging, and more - all in one place.
                </span>
              </p>
              <Link href="" className="text-primary-foreground hover:underline">
                Learn more <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="aspect-square rounded-lg bg-surface-1 p-4 pt-8 md:p-6 md:pt-10">
            <div className="space-y-4">
              <IconColorPalette2FillDuo18 className="size-10" />
              <p className="text-foreground text-xl">
                Smart tools
                <br />
                <span className="text-lg text-muted-foreground">
                  Developer Tools that save you time.
                </span>
              </p>
              <Link href="" className="text-primary-foreground hover:underline">
                Learn more <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="aspect-square rounded-lg bg-surface-1 p-4 pt-8 md:p-6 md:pt-10">
            <div className="space-y-4">
              <IconSparkleFillDuo18 className="size-10" />
              <p className="text-foreground text-xl">
                Pixel perfect
                <br />
                <span className="text-lg text-muted-foreground">
                  Built to delight designers and developers alike.
                </span>
              </p>
              <Link href="" className="text-primary-foreground hover:underline">
                Learn more <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export default function Home() {
  const posthog = usePostHog();
  const [starCount, setStarCount] = useState<number | null>(null);
  const [userOS, setUserOS] = useState<string>('your OS');
  const [downloadUrl, setDownloadUrl] = useState<string>('#');
  const [isMobile, setIsMobile] = useState(false);
  const [isOsSupported, setIsOsSupported] = useState(true);

  // Fetch GitHub star count
  useEffect(() => {
    const fetchStarCount = async () => {
      try {
        const response = await fetch(
          'https://api.github.com/repos/stagewise-io/stagewise',
        );
        if (response.ok) {
          const data = await response.json();
          setStarCount(data.stargazers_count);
        }
      } catch {
        // Fallback to a default value if API fails
        setStarCount(4300);
      }
    };

    fetchStarCount();
  }, []);

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
      setUserOS('macOS');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/beta/macos/arm64',
      );
    } else if (platform.includes('win') || userAgent.includes('win')) {
      setUserOS('Windows');
      setDownloadUrl('https://dl.stagewise.io/download/stagewise/beta/win/x64');
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      setUserOS('Linux');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/beta/linux/deb/x86_64',
      );
    } else {
      setIsOsSupported(false);
    }
  }, []);

  // Format star count for display
  const formatStarCount = (count: number | null) => {
    if (count === null) return '3K+'; // Loading state
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K+`;
    }
    return count.toString();
  };

  return (
    <div className="relative mx-auto mt-12 min-h-screen w-full max-w-7xl px-4">
      {/* Hero Section */}
      <section className="relative z-10 w-full pb-16 md:pb-20">
        <div className="flex justify-start">
          <div className="w-full max-w-7xl">
            <ScrollReveal>
              <div className="mb-12 flex flex-col items-start px-4 text-left sm:px-0">
                <h1 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    Stagewise is a purpose-built
                    <br />
                    browser for web development.
                  </span>
                </h1>

                <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
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
                        buttonVariants({ size: 'lg', variant: 'primary' }),
                      )}
                    >
                      Download for {userOS}
                      <IconDownload4FillDuo18 className="size-4" />
                    </Link>
                  )}
                  <a
                    href="https://github.com/stagewise-io/stagewise"
                    onClick={() => posthog?.capture('hero_github_star_click')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'ghost', size: 'lg' })}
                  >
                    <IconGithub className="size-5" />
                    <span className="font-medium text-sm">
                      {formatStarCount(starCount)}
                    </span>
                  </a>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="flex justify-end">
                <div className="group relative mt-8 mb-16 max-w-4xl transform rounded-xl border border-zinc-900/50 dark:border-zinc-100/50">
                  <video
                    src="https://github.com/stagewise-io/assets/raw/refs/heads/main/edited/0-6-0-undo/landing-demo-undo.mp4"
                    width={1200}
                    height={675}
                    className="w-full rounded-xl transition-all duration-300 group-hover:blur-[2px]"
                    autoPlay
                    muted
                    loop
                    preload="auto"
                    playsInline
                  />
                  {/* Overlay with button */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <a
                      href="https://www.youtube.com/watch?v=C1fWQl8r_zY"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-white/80 px-6 py-3 font-medium text-zinc-900 shadow-lg transition-all duration-200 hover:bg-white hover:shadow-xl dark:bg-zinc-900/80 dark:text-white dark:hover:bg-zinc-900"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Watch full demo
                    </a>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Enhanced Bento Grid Features Section */}
      <FeatureSection />

      {/* Product values section */}
      <ProductValuesSection />

      {/* Second Get Started Section */}
      <section className="relative z-10 w-full py-40 md:py-48">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-7xl pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  The browser for web developers.
                </span>
              </h2>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
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
                    className={buttonVariants({
                      size: 'lg',
                      variant: 'primary',
                    })}
                  >
                    Download for {userOS}
                    <IconDownload4FillDuo18 className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
