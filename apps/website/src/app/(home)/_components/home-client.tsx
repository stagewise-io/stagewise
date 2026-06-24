'use client';
import { IconGithub } from 'nucleo-social-media';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { IconDownload4FillDuo18 } from 'nucleo-ui-fill-duo-18';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import type { NewsType } from '@/lib/news';
import { usePostHog } from 'posthog-js/react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@stagewise/stage-ui/lib/utils';
import efficientCodingAgentDark from './feature-images/efficient-coding-agent-dark.webp';
import efficientCodingAgentLight from './feature-images/efficient-coding-agent-light.webp';
import agentManagementDark from './feature-images/agent-management-dark.webp';
import agentManagementLight from './feature-images/agent-management-light.webp';
import fullDemoDark from './feature-images/full-demo-dark.webp';
import fullDemoLight from './feature-images/full-demo-light.webp';
import bgDark from './feature-images/bg-dark.jpg';
import bgLight from './feature-images/bg-light.jpg';
import companyAbout from './feature-images/company-about.webp';
import useExistingSubscriptionDark from './feature-images/use-existing-subscription-dark.webp';
import useExistingSubscriptionLight from './feature-images/use-existing-subscription-light.webp';

import { Cloud, Key, Monitor } from 'lucide-react';

const DARK_FILTER: Record<string, string> = {
  'openai.png': 'dark:invert',
  'anthropic.png': 'dark:invert',
  'ollama.png': 'dark:invert',
  'chatgpt.png': 'dark:invert',
  'aws.png': 'dark:[filter:invert(1)_hue-rotate(180deg)]',
};

const PROVIDER_ICONS: Record<string, string[]> = {
  'stagewise Cloud': [
    'chatgpt.png',
    'claude.png',
    'gemini.png',
    'deepseek.png',
    'kimi.png',
    'minimax.png',
  ],
  'BYOK / External subscriptions': [
    'openai.png',
    'anthropic.png',
    'aws.png',
    'azure.png',
    'vertex.png',
  ],
  'Local inference': ['vllm.png', 'lmstudio.webp', 'ollama.png'],
};
import { NewsSection } from './news-section';
import { ModelProviderShowcase } from './model-provider-showcase';

interface NewsPost {
  title: string;
  url: string;
  date: string;
  type: NewsType;
}

const HERO_IMAGE_SIZES = '(min-width: 1280px) 1216px, calc(100vw - 32px)';
const FEATURE_IMAGE_SIZES =
  '(min-width: 1280px) 700px, (min-width: 768px) 60vw, calc(100vw - 80px)';
const FEATURE_ZOOM_IMAGE_SIZES =
  '(min-width: 1280px) 1200px, (min-width: 768px) 90vw, 100vw';
const AGENT_MANAGEMENT_IMAGE_SIZES =
  '(min-width: 1280px) 2100px, (min-width: 768px) 180vw, 200vw';
const OPEN_SOURCE_IMAGE_SIZES =
  '(min-width: 1280px) 560px, (min-width: 768px) 45vw, calc(100vw - 80px)';

export function DownloadButtons({ className }: { className?: string }) {
  const [userOS, setUserOS] = useState<string>('your OS');
  const [downloadUrl, setDownloadUrl] = useState<string>('#');
  const [isMobile, setIsMobile] = useState(false);
  const [isOsSupported, setIsOsSupported] = useState(true);

  useEffect(() => {
    const platform =
      (
        navigator as Navigator & {
          userAgentData?: { platform?: string };
        }
      ).userAgentData?.platform?.toLowerCase() ?? '';
    const userAgent = navigator.userAgent.toLowerCase();

    const mobileCheck =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent,
      );
    setIsMobile(mobileCheck);

    if (platform.includes('mac') || userAgent.includes('mac')) {
      setUserOS('macOS');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/macos/arm64',
      );
    } else if (platform.includes('win') || userAgent.includes('win')) {
      setUserOS('Windows');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/win/x64',
      );
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      setUserOS('Linux');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/linux/deb/x86_64',
      );
    } else {
      setIsOsSupported(false);
    }
  }, []);

  if (!isOsSupported) {
    return (
      <Button size="lg" variant="primary" disabled className={className}>
        OS not supported
      </Button>
    );
  }

  if (isMobile) {
    return (
      <Button size="lg" variant="primary" disabled className={className}>
        Download on Desktop
      </Button>
    );
  }

  return (
    <a
      href={downloadUrl}
      className={cn(
        buttonVariants({ size: 'lg', variant: 'primary' }),
        className,
      )}
    >
      Download for {userOS}
      <IconDownload4FillDuo18 className="size-4" />
    </a>
  );
}

function FeatureSection() {
  return (
    <section className="relative z-10 w-full py-20 md:py-28">
      <div className="flex justify-center">
        <ScrollReveal>
          <div className="mb-20 max-w-3xl pt-8 text-center">
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Built for developers
            </h2>
            <p className="text-base text-muted-foreground">
              stagewise delivers an agentic coding experience built around the
              needs of developers.
            </p>
          </div>
        </ScrollReveal>
      </div>

      <div className="flex flex-col items-stretch gap-10 md:gap-20">
        <ScrollReveal delay={0}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row-reverse md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">Use any model</h3>
              <p className="text-base text-muted-foreground">
                Access frontier and open-weight models through the stagewise
                Cloud, your own API subscriptions, or run them locally — no
                lock-in.
              </p>
            </div>
            <div className="relative flex w-full shrink-0 overflow-hidden rounded-md bg-background ring-1 ring-surface-2 md:aspect-square md:max-w-[60%]">
              <div
                className="absolute inset-0 opacity-5"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, var(--color-muted-foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--color-muted-foreground) 1px, transparent 1%)',
                  backgroundSize: '20px 20px',
                }}
              />
              <div className="relative flex h-full w-full flex-col items-stretch justify-center gap-4 p-6 sm:gap-6 sm:p-12 md:gap-8 md:p-16 lg:gap-10 lg:p-20">
                {[
                  { icon: Cloud, label: 'stagewise Cloud' },
                  { icon: Key, label: 'BYOK / External subscriptions' },
                  { icon: Monitor, label: 'Local inference' },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex flex-1 flex-col items-start justify-start gap-3 overflow-hidden rounded-md border border-border-subtle bg-background p-3 shadow-md"
                  >
                    <div className="flex shrink-0 flex-row items-center gap-1">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground text-xs">
                        {label}
                      </span>
                    </div>
                    <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-center gap-4 overflow-hidden md:gap-7">
                      {PROVIDER_ICONS[label]?.map((icon) => (
                        <div
                          key={icon}
                          className={cn('relative shrink-0', DARK_FILTER[icon])}
                        >
                          <Image
                            src={`/icons/${icon}`}
                            alt=""
                            width={32}
                            height={32}
                            className="size-6 max-w-none object-contain md:size-8"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">Efficient coding agent</h3>
              <p className="text-base text-muted-foreground">
                The stagewise agent maximizes cache-hit rates and dynamically
                controls context — enabling long-running tasks at surprisingly
                low cost.
              </p>
              <div className="pt-12">
                <p className="font-semibold text-3xl text-foreground tracking-tight">
                  87.6%
                </p>
                <p className="text-muted-foreground text-sm">
                  Avg. Cache Hit Rate
                </p>
              </div>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={efficientCodingAgentLight}
                className="absolute top-1/2 left-0 w-full dark:hidden"
                style={{
                  transform: 'translateX(0%) translateY(-50%) scale(1.6)',
                  transformOrigin: 'left center',
                }}
                alt="Efficient coding agent view"
                sizes={FEATURE_ZOOM_IMAGE_SIZES}
                quality={80}
              />
              <Image
                src={efficientCodingAgentDark}
                className="absolute top-1/2 left-0 hidden w-full dark:block"
                style={{
                  transform: 'translateX(0%) translateY(-50%) scale(1.6)',
                  transformOrigin: 'left center',
                }}
                alt="Efficient coding agent view"
                sizes={FEATURE_ZOOM_IMAGE_SIZES}
                quality={80}
              />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row-reverse md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">
                Orchestrate many agents at once
              </h3>
              <p className="text-base text-muted-foreground">
                stagewise is your command center for running agents in parallel
                — each implementing full features or fixing bugs independently.
              </p>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={agentManagementLight}
                className="absolute top-0 left-0 w-full dark:hidden"
                style={{ transform: 'scale(3)', transformOrigin: 'top left' }}
                alt="Agent management view"
                sizes={AGENT_MANAGEMENT_IMAGE_SIZES}
                quality={85}
              />
              <Image
                src={agentManagementDark}
                className="absolute top-0 left-0 hidden w-full dark:block"
                style={{ transform: 'scale(3)', transformOrigin: 'top left' }}
                alt="Agent management view"
                sizes={AGENT_MANAGEMENT_IMAGE_SIZES}
                quality={85}
              />
            </div>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={300}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">
                Use any coding subscription
              </h3>
              <p className="text-base text-muted-foreground">
                Use all popular models through your stagewise account, or
                connect any existing coding subscription.
              </p>
              <div className="pt-12">
                <p className="mb-3 text-muted-foreground text-sm">
                  Supported subscriptions
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Kimi',
                    'Qwen Coding Plan',
                    'MiniMax',
                    'Xiaomi MiMo',
                    'OpenAI',
                    'Anthropic',
                    'Google Gemini',
                    'DeepSeek',
                  ].map((plan) => (
                    <span
                      key={plan}
                      className="rounded-full border border-border-subtle px-3 py-1 text-foreground/80 text-sm"
                    >
                      {plan}
                    </span>
                  ))}
                  <span className="px-1 py-1 text-muted-foreground/50 text-sm">
                    & more
                  </span>
                </div>
              </div>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={useExistingSubscriptionLight}
                className="absolute top-1/2 left-1/2 w-full dark:hidden"
                style={{
                  transform: 'translateX(-50%) translateY(-50%) scale(0.92)',
                  transformOrigin: 'center center',
                }}
                alt="Use existing subscription view"
                sizes={FEATURE_IMAGE_SIZES}
                quality={80}
              />
              <Image
                src={useExistingSubscriptionDark}
                className="absolute top-1/2 left-1/2 hidden w-full dark:block"
                style={{
                  transform: 'translateX(-50%) translateY(-50%) scale(0.92)',
                  transformOrigin: 'center center',
                }}
                alt="Use existing subscription view"
                sizes={FEATURE_IMAGE_SIZES}
                quality={80}
              />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function HomeClient({ newsPosts }: { newsPosts: NewsPost[] }) {
  const posthog = usePostHog();
  const [starCount, setStarCount] = useState<number | null>(null);

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
        setStarCount(4300);
      }
    };

    fetchStarCount();
  }, []);

  const formatStarCount = (count: number | null) => {
    if (count === null) return '3K+';
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K+`;
    }
    return count.toString();
  };

  return (
    <>
      {/* Hero Section */}
      <section className="relative z-10 w-full pb-4 md:pb-6">
        <div className="flex justify-start">
          <div className="w-full max-w-7xl">
            <ScrollReveal>
              <div className="mt-0 mb-6 flex flex-col items-start text-left md:mt-2 md:mb-8">
                <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    The Agentic IDE for Open-Source Models
                  </span>
                </h1>
                <span className="mb-8 text-lg text-muted-foreground leading-relaxed">
                  stagewise is a next-gen agent orchestrator for software
                  engineers, leveraging our frontier-grade agent harness.
                  <br />
                  Full model sovereignty. Runs locally, connects to anything.
                </span>

                <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <DownloadButtons />
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
              <div className="relative mt-6 mb-6 flex w-full items-center justify-center overflow-hidden rounded-2xl p-6 ring-1 ring-surface-2 md:mt-8 md:p-10">
                <Image
                  src={bgLight}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover dark:hidden"
                  sizes={HERO_IMAGE_SIZES}
                  quality={70}
                  priority
                />
                <Image
                  src={bgDark}
                  alt=""
                  className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                  sizes={HERO_IMAGE_SIZES}
                  quality={70}
                  priority
                />
                <Image
                  src={fullDemoLight}
                  alt="stagewise full product overview"
                  className="relative z-10 block h-full dark:hidden"
                  sizes={HERO_IMAGE_SIZES}
                  quality={85}
                  priority
                />
                <Image
                  src={fullDemoDark}
                  alt="stagewise full product overview"
                  className="relative z-10 hidden h-full dark:block"
                  sizes={HERO_IMAGE_SIZES}
                  quality={85}
                  priority
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Model Provider Showcase */}
      <ModelProviderShowcase />

      {/* Features */}
      <FeatureSection />

      {/* Ready for your enterprise */}
      <section className="relative z-10 w-full py-20 md:py-28">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="max-w-3xl pt-8 text-center">
              <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
                Ready for your enterprise
              </h2>
              <p className="text-base text-muted-foreground">
                Run stagewise the way your team needs — on your infrastructure,
                with your models, under your control.
              </p>
              <Link
                href="/enterprise"
                className="mt-2 inline-flex items-center gap-2 text-base text-primary-foreground hover:text-hover-derived active:text-active-derived"
              >
                stagewise for Enterprises
                <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* News section */}
      <NewsSection posts={newsPosts} />

      {/* Company section */}
      <section className="relative z-10 w-full py-10 md:py-16">
        <ScrollReveal>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row-reverse md:items-center md:gap-12">
            <div className="space-y-3">
              <h3 className="font-medium text-2xl">
                Building applied AI for a better future
              </h3>
              <p className="text-base text-muted-foreground">
                stagewise focusses on making artificial intelligence accessible
                to anyone by keeping cost low and putting great emphasis on a
                simple user experience.
              </p>
              <div className="my-6">
                <p className="mb-3 font-light text-muted-foreground text-sm">
                  Backed by
                </p>
                <div className="flex flex-wrap items-center gap-5 opacity-40">
                  <Image
                    src="/logos/yc-monochrome.svg"
                    alt="Y Combinator"
                    width={90}
                    height={24}
                    className="h-5 w-auto dark:invert"
                    unoptimized
                  />
                  <Image
                    src="/logos/twentytwo.webp"
                    alt="TwentyTwo Ventures"
                    width={80}
                    height={20}
                    className="h-4 w-auto dark:invert"
                  />
                  <Image
                    src="/logos/blast-monochrome.svg"
                    alt="Blast Club"
                    width={72}
                    height={20}
                    className="h-4 w-auto dark:invert"
                    unoptimized
                  />
                  <Image
                    src="/logos/teutoseedclub-monochrome.svg"
                    alt="Teuto Seed Club"
                    width={80}
                    height={20}
                    className="h-4 w-auto dark:invert"
                    unoptimized
                  />
                </div>
              </div>
              <Link
                href="/company"
                className="inline-flex w-fit items-center gap-2 text-primary-foreground hover:text-hover-derived active:text-active-derived"
              >
                Learn more about us
                <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[45%]"
              style={{ aspectRatio: '4 / 3' }}
            >
              <Image
                src={companyAbout}
                className="absolute inset-0 h-full w-full object-contain"
                alt="AI for a better future"
                sizes={OPEN_SOURCE_IMAGE_SIZES}
                quality={80}
              />
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Second Get Started Section */}
      <section className="relative z-10 w-full py-40 md:py-48">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-7xl pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  The Agentic IDE for Open-Source Models
                </span>
              </h2>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <DownloadButtons className="w-full sm:w-auto" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
