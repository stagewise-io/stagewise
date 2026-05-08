'use client';
import { IconGithub } from 'nucleo-social-media';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { IconDownload4FillDuo18 } from 'nucleo-ui-fill-duo-18';
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
import useExistingSubscriptionDark from './feature-images/use-existing-subscription-dark.webp';
import useExistingSubscriptionLight from './feature-images/use-existing-subscription-light.webp';
import githubRepoIssuesDark from './feature-images/github-repo-issues-dark.webp';
import githubRepoIssuesLight from './feature-images/github-repo-issues-light.webp';
import fullDemoDark from './feature-images/full-demo-dark.png';
import fullDemoLight from './feature-images/full-demo-light.png';
import bgDark from './feature-images/bg-dark.jpg';
import bgLight from './feature-images/bg-light.jpg';

import { NewsSection } from './news-section';
import { ModelProviderShowcase } from './model-provider-showcase';

interface NewsPost {
  title: string;
  url: string;
  date: string;
  type: NewsType;
}

function DownloadButtons({ className }: { className?: string }) {
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
        'https://dl.stagewise.io/download/stagewise/alpha/macos/arm64',
      );
    } else if (platform.includes('win') || userAgent.includes('win')) {
      setUserOS('Windows');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/win/x64',
      );
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      setUserOS('Linux');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/alpha/linux/deb/x86_64',
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
              className="relative w-full shrink-0 overflow-hidden rounded-md md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
              />
              <Image
                src={efficientCodingAgentLight}
                className="absolute top-1/2 left-0 w-full dark:hidden"
                style={{
                  transform: 'translateX(0%) translateY(-50%) scale(1.6)',
                  transformOrigin: 'left center',
                }}
                alt="Efficient coding agent view"
              />
              <Image
                src={efficientCodingAgentDark}
                className="absolute top-1/2 left-0 hidden w-full dark:block"
                style={{
                  transform: 'translateX(0%) translateY(-50%) scale(1.6)',
                  transformOrigin: 'left center',
                }}
                alt="Efficient coding agent view"
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
              className="relative w-full shrink-0 overflow-hidden rounded-md md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
              />
              <Image
                src={agentManagementLight}
                className="absolute top-0 left-0 w-full dark:hidden"
                style={{ transform: 'scale(3)', transformOrigin: 'top left' }}
                alt="Agent management view"
              />
              <Image
                src={agentManagementDark}
                className="absolute top-0 left-0 hidden w-full dark:block"
                style={{ transform: 'scale(3)', transformOrigin: 'top left' }}
                alt="Agent management view"
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
                    'GLM Coding Plan',
                    'Kimi',
                    'Qwen Coding Plan',
                    'MiniMax',
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
              className="relative w-full shrink-0 overflow-hidden rounded-md md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
              />
              <Image
                src={useExistingSubscriptionLight}
                className="absolute top-1/2 left-1/2 w-full dark:hidden"
                style={{
                  transform: 'translateX(-50%) translateY(-50%) scale(0.92)',
                  transformOrigin: 'center center',
                }}
                alt="Use existing subscription view"
              />
              <Image
                src={useExistingSubscriptionDark}
                className="absolute top-1/2 left-1/2 hidden w-full dark:block"
                style={{
                  transform: 'translateX(-50%) translateY(-50%) scale(0.92)',
                  transformOrigin: 'center center',
                }}
                alt="Use existing subscription view"
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
              <div className="mt-0 mb-6 flex flex-col items-start px-4 text-left sm:px-0 md:mt-2 md:mb-8">
                <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    The Open Source Agentic IDE
                  </span>
                </h1>
                <span className="mb-8 text-lg text-muted-foreground leading-relaxed">
                  Create and orchestrate coding agents, show app previews and
                  run git workflows.
                  <br />
                  Use your favorite models across all providers.
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
              <div className="relative mt-6 mb-6 flex w-full items-center justify-center overflow-hidden rounded-2xl p-6 md:mt-8 md:p-10">
                <Image
                  src={bgLight}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover dark:hidden"
                  priority
                />
                <Image
                  src={bgDark}
                  alt=""
                  className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                  priority
                />
                <Image
                  src={fullDemoLight}
                  alt="stagewise full product overview"
                  className="relative z-10 block h-full dark:hidden"
                  priority
                />
                <Image
                  src={fullDemoDark}
                  alt="stagewise full product overview"
                  className="relative z-10 hidden h-full dark:block"
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

      {/* News section */}
      <NewsSection posts={newsPosts} />

      {/* Open-Source section */}
      <section className="relative z-10 w-full py-10 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row-reverse md:items-center md:gap-12">
              <div className="space-y-2">
                <h3 className="font-medium text-2xl">
                  Open-Source and extensible
                </h3>
                <p className="text-base text-muted-foreground">
                  A first-class coding experience, built in the open and
                  compatible with your favorite models — including the ones you
                  run locally.
                </p>
              </div>
              <div
                className="relative w-full shrink-0 overflow-hidden rounded-md md:max-w-[45%]"
                style={{ aspectRatio: '16 / 9' }}
              >
                <Image
                  src={bgLight}
                  className="absolute inset-0 h-full w-full object-cover dark:hidden"
                  alt=""
                />
                <Image
                  src={bgDark}
                  className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                  alt=""
                />
                <Image
                  src={githubRepoIssuesLight}
                  className="absolute top-0 left-0 w-full dark:hidden"
                  style={{
                    transform: 'scale(1.5)',
                    transformOrigin: 'top left',
                  }}
                  alt="GitHub repo issues view"
                />
                <Image
                  src={githubRepoIssuesDark}
                  className="absolute top-0 left-0 hidden w-full dark:block"
                  style={{
                    transform: 'scale(1.5)',
                    transformOrigin: 'top left',
                  }}
                  alt="GitHub repo issues view"
                />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Second Get Started Section */}
      <section className="relative z-10 w-full py-40 md:py-48">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-7xl pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  The Open Source Agentic IDE
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
