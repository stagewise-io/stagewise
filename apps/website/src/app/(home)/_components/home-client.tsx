'use client';
import { IconGithub } from 'nucleo-social-media';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { usePostHog } from 'posthog-js/react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@stagewise/stage-ui/lib/utils';
import experimentsImage from '../../../../../browser/src/ui/assets/feature-images/experiments-light.png';
import experimentsImageDark from '../../../../../browser/src/ui/assets/feature-images/experiments-dark.png';
import agentIdeIntegrationDark from '../../../../../browser/src/ui/assets/feature-images/agent-ide-integration-dark.png';
import agentIdeIntegrationLight from '../../../../../browser/src/ui/assets/feature-images/agent-ide-integration-light.png';
import reverseEngineeringDark from '../../../../../browser/src/ui/assets/feature-images/reverse-engineering-dark.png';
import reverseEngineeringLight from '../../../../../browser/src/ui/assets/feature-images/reverse-engineering-light.png';
import debuggerAccessDark from '../../../../../browser/src/ui/assets/feature-images/debugger-access-dark.png';
import debuggerAccessLight from '../../../../../browser/src/ui/assets/feature-images/debugger-access-light.png';
import fullDemoDark from '../../../../../browser/src/ui/assets/feature-images/full-demo-dark.png';
import fullDemoLight from '../../../../../browser/src/ui/assets/feature-images/full-demo-light.png';
import bgDark from '../../../../../browser/src/ui/assets/feature-images/bg-dark.jpg';
import bgLight from '../../../../../browser/src/ui/assets/feature-images/bg-light.jpg';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { IconCheckOutline18 } from 'nucleo-ui-outline-18';
import { NewsSection } from './news-section';

interface NewsPost {
  title: string;
  url: string;
  date: string;
}

function WaitlistForm({
  className,
  align = 'start',
}: {
  className?: string;
  align?: 'start' | 'center';
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `https://waitlister.me/s/${process.env.NEXT_PUBLIC_WAITLISTER_WAITLIST_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ email }),
        },
      );

      const data = await response.json();

      if (data.success) setSuccess(true);
      else
        setError(
          data.error?.message || 'Failed to join waitlist. Please try again.',
        );
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className ?? ''}`}>
        <IconCheckOutline18 className="size-3.5 text-foreground" />
        <span className="text-foreground">You're on the list!</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <form
        className={cn(
          'flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center',
          align === 'start' ? 'items-start' : 'items-center',
        )}
        onSubmit={handleSubmit}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="h-12 w-full rounded-md border border-input bg-background px-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-64"
          required
          disabled={submitting}
        />
        <Button type="submit" size="lg" variant="primary" disabled={submitting}>
          {submitting ? 'Joining...' : 'Join waitlist'}
          <IconArrowRightFill18 className="size-4" />
        </Button>
      </form>
      {error && <p className="mt-2 text-error-foreground text-sm">{error}</p>}
    </div>
  );
}

function FeatureSection() {
  return (
    <section className="relative z-10 w-full py-40 md:py-48">
      <div className="flex justify-center">
        <ScrollReveal>
          <div className="mb-20 max-w-3xl pt-8 text-center">
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Built for developers
            </h2>
            <p className="font-light text-base text-muted-foreground">
              stagewise delivers a browsing experience that prioritizes the
              needs of web developers.
            </p>
          </div>
        </ScrollReveal>
      </div>

      <div className="flex flex-col items-stretch gap-10 md:gap-20">
        <ScrollReveal delay={100}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-border bg-surface-1 p-4 md:flex-row md:items-center md:gap-12 md:p-6">
            <div className="space-y-2">
              <h3 className="text-foreground text-xl">
                Full access to the devtools
              </h3>
              <p className="font-light text-base text-muted-foreground">
                The stagewise agent has console and debugger access on all tabs.
              </p>
            </div>
            <Image
              src={debuggerAccessLight}
              className="block w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:hidden"
              alt="Image showing a browser with an integrated coding agent"
            />
            <Image
              src={debuggerAccessDark}
              className="hidden w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:block"
              alt="Image showing a browser with an integrated coding agent"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-border bg-surface-1 p-4 md:flex-row-reverse md:items-center md:gap-12 md:p-6">
            <div className="space-y-2">
              <h3 className="text-foreground text-xl">
                Temporary or permanent changes
              </h3>
              <p className="font-light text-base text-muted-foreground">
                Make quick test changes to any page, or connect a codebase for
                permanent edits.
              </p>
            </div>
            <Image
              src={experimentsImage}
              className="block w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:hidden"
              alt="Image showing a browser with an integrated coding agent"
            />
            <Image
              src={experimentsImageDark}
              className="hidden w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:block"
              alt="Image showing a browser with an integrated coding agent"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-border bg-surface-1 p-4 md:flex-row md:items-center md:gap-12 md:p-6">
            <div className="space-y-2">
              <h3 className="text-foreground text-xl">
                Powerful reverse engineering tools
              </h3>
              <p className="font-light text-base text-muted-foreground">
                Understand and re-use components, style systems and color
                palettes from any website.
              </p>
            </div>
            <Image
              src={reverseEngineeringLight}
              className="block w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:hidden"
              alt="Reverse engineering tools extracting styles from websites"
            />
            <Image
              src={reverseEngineeringDark}
              className="hidden w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:block"
              alt="Reverse engineering tools extracting styles from websites"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal delay={400}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-border bg-surface-1 p-4 md:flex-row-reverse md:items-center md:gap-12 md:p-6">
            <div className="space-y-2">
              <h3 className="text-foreground text-xl">
                Integrated with your setup
              </h3>
              <p className="font-light text-base text-muted-foreground">
                Opt-in to view relevant and modified files in your favorite IDE
              </p>
            </div>
            <Image
              src={agentIdeIntegrationLight}
              className="block w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:hidden"
              alt="IDE integration showing code changes in your favorite editor"
            />
            <Image
              src={agentIdeIntegrationDark}
              className="hidden w-full shrink-0 rounded-md border border-border md:max-w-[60%] dark:block"
              alt="IDE integration showing code changes in your favorite editor"
            />
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
      <section className="relative z-10 w-full pb-16 md:pb-20">
        <div className="flex justify-start">
          <div className="w-full max-w-7xl">
            <ScrollReveal>
              <div className="mt-4 mb-12 flex flex-col items-start px-4 text-left sm:px-0 md:mt-8 md:mb-20">
                <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    The coding agent built for the web
                  </span>
                </h1>
                <span className="mb-8 text-md text-muted-foreground">
                  stagewise is a purpose-built browser for developers with a
                  coding agent built right in.
                </span>

                <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <WaitlistForm />
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
              <div className="relative mt-16 mb-16 flex w-full items-center justify-center overflow-hidden rounded-md p-0 md:mt-20">
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

      {/* Features */}
      <FeatureSection />

      {/* News section */}
      <NewsSection posts={newsPosts} />

      {/* Second Get Started Section */}
      <section className="relative z-10 w-full py-40 md:py-48">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-7xl pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  The coding agent built for the web
                </span>
              </h2>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <WaitlistForm align="center" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
