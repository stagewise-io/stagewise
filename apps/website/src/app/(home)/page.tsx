'use client';
import Link from 'next/link';

import { Code, Sparkles, Globe, Shield, Rocket, Eye } from 'lucide-react';
import { IconDownload4FillDuo18 } from 'nucleo-ui-fill-duo-18';
import { IconGithub } from 'nucleo-social-media';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { PackageManagerClipboard } from '@/components/package-manager-clipboard';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { usePostHog } from 'posthog-js/react';
import { useState, useEffect } from 'react';

import ReactLogo from './_components/techstack_logos/react.png';
import NextJsLogo from './_components/techstack_logos/nextjs.png';
import ShadCNLogo from './_components/techstack_logos/shadcn.png';
import TailwindLogo from './_components/techstack_logos/tailwind.png';
import VueLogo from './_components/techstack_logos/vue.png';
import NuxtLogo from './_components/techstack_logos/nuxt.png';
import PrimeVueLogo from './_components/techstack_logos/primevue.png';
import AngularLogo from './_components/techstack_logos/angular.png';
import ViteLogo from './_components/techstack_logos/vite.png';
import MaterialUILogo from './_components/techstack_logos/materialui.png';
import SassLogo from './_components/techstack_logos/sass.png';
import SvelteLogo from './_components/techstack_logos/svelte.png';
import SvelteKitLogo from './_components/techstack_logos/sveltekit.png';
import FlowbiteUILogo from './_components/techstack_logos/flowbite.png';
import CSSLogo from './_components/techstack_logos/css.png';

// Simplified Setup Guide Component
function _SimplifiedSetupGuide() {
  return (
    <div className="flex max-w-3xl flex-col items-center text-center">
      <h2 className="mb-6 font-bold text-3xl md:text-4xl">Get started</h2>
      <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
        Get up and running with stagewise in just 3 simple steps
      </p>

      {/* 3 Steps and Command Side by Side */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2 lg:items-center">
        {/* Steps List */}
        <div className="space-y-4 justify-self-center text-left lg:justify-self-start">
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 font-semibold text-blue-600 text-sm dark:bg-blue-400/20 dark:text-blue-400">
              1
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                Start the dev server of your app
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Start the dev server of your local dev project
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 font-semibold text-indigo-600 text-sm dark:bg-indigo-400/20 dark:text-indigo-400">
              2
            </div>
            <div>
              <h3 className="font-semibold text-lg">Open a second terminal</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Open a second terminal window in the root of your dev project
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 font-semibold text-sm text-violet-600 dark:bg-violet-400/20 dark:text-violet-400">
              3
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                Invoke the stagewise command
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Run the stagewise command and start building
              </p>
            </div>
          </div>
        </div>

        {/* Command */}
        <div className="flex items-center justify-center lg:justify-start">
          <PackageManagerClipboard />
        </div>
      </div>

      {/* Integration with other agents banner */}
      <div className="mt-8">
        <div className="max-w-lg rounded-lg bg-blue-50/80 p-6 dark:bg-blue-950/20">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <p className="text-left text-blue-700 text-sm dark:text-blue-300">
              Here for the stagewise integration with other agents?
            </p>
            <Link
              href="/docs/advanced-usage/use-different-agents"
              className={`${buttonVariants({ variant: 'primary', size: 'sm' })} shrink-0`}
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Enhanced Bento Grid Features Component with 16:9 aspect ratio
function BentoGrid() {
  const features = [
    {
      title: 'No more context switching',
      description:
        'Prompt changes right where you see them - not in a separate code editor.',
      icon: <Eye className="h-8 w-8 text-blue-500 dark:text-blue-400" />,
      className:
        'aspect-video bg-gradient-to-br from-blue-300/8 via-blue-200/4 to-transparent dark:from-blue-400/20 dark:via-blue-300/10 dark:to-transparent',
      iconPosition: 'bottom-right',
    },
    {
      title: 'Open Source',
      description:
        'Built in public with full transparency and community contributions',
      icon: <Code className="h-8 w-8 text-fuchsia-500 dark:text-fuchsia-400" />,
      className:
        'aspect-video bg-gradient-to-br from-fuchsia-300/8 via-fuchsia-200/4 to-transparent dark:from-fuchsia-400/20 dark:via-fuchsia-300/10 dark:to-transparent',
      iconPosition: 'bottom-right',
    },
    {
      title: 'Secure by Design',
      description:
        'Fully local agent architecture. Use your own model providers - or get maximum ease of use with our subscription.',
      icon: <Shield className="h-8 w-8 text-violet-500 dark:text-violet-400" />,
      className:
        'aspect-video bg-gradient-to-br from-violet-300/8 via-violet-200/4 to-transparent dark:from-violet-400/20 dark:via-violet-300/10 dark:to-transparent',
      iconPosition: 'bottom-right',
    },
    {
      title: 'Lightning Fast',
      description:
        'When iterating on UX and UI, you need snappy responses. stagewise focuses on maximum speed to deliver an unmatched experience.',
      icon: <Rocket className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />,
      className:
        'aspect-video bg-gradient-to-br from-indigo-300/8 via-indigo-200/4 to-transparent dark:from-indigo-400/20 dark:via-indigo-300/10 dark:to-transparent',
      iconPosition: 'bottom-right',
    },
    {
      title: 'Universal Compatibility',
      description:
        'Works seamlessly with React, Vue, Angular, Tailwind, Bootstrap, Material-UI, and countless other frameworks and design systems',
      icon: <Globe className="h-8 w-8 text-blue-500 dark:text-blue-400" />,
      className:
        'aspect-video bg-gradient-to-br from-blue-300/8 via-blue-200/4 to-transparent',
      iconPosition: 'bottom-right',
    },
    {
      title: 'Smart Suggestions',
      description:
        'Smart improvement suggestions that understand your design system and maintain your brand identity.',
      icon: (
        <Sparkles className="h-8 w-8 text-fuchsia-500 dark:text-fuchsia-400" />
      ),
      className:
        'aspect-video bg-gradient-to-br from-fuchsia-300/8 via-fuchsia-200/4 to-transparent',
      iconPosition: 'bottom-right',
    },
  ];

  return (
    <div className="flex justify-center">
      <div className="grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <ScrollReveal key={feature.title} delay={index * 100}>
            <div
              className={`group relative overflow-hidden rounded-xl bg-white/20 p-6 transition-all duration-300 hover:bg-white/30 dark:bg-transparent dark:hover:bg-white/5 ${feature.className} flex flex-col justify-between`}
            >
              <div className="relative z-10">
                <h3 className="mb-2 font-semibold text-lg">{feature.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </div>

              {/* Large icon positioned at bottom right, contained within bounds */}
              <div className="group-hover:-translate-y-2 absolute right-2 bottom-2 opacity-50 transition-all duration-500 group-hover:opacity-60">
                <div className="scale-[4] transform">{feature.icon}</div>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}

// Tech Stack Compatibility Section
function _CompatibilitySection() {
  const [currentCombination, setCurrentCombination] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showGlow, setShowGlow] = useState(true);

  // All possible combinations
  const combinations = [
    {
      component1: {
        name: 'React',
        icon: <img src={ReactLogo.src} alt="React" className="h-1/3" />,
        glow: 'shadow-cyan-500/12 dark:shadow-cyan-400/40 bg-cyan-300/5 dark:bg-cyan-400/10',
      },
      component2: {
        name: 'Next.js',
        icon: <img src={NextJsLogo.src} alt="Next.js" className="h-1/3" />,
        glow: 'shadow-gray-500/12 dark:shadow-gray-400/40 bg-gray-300/5 dark:bg-gray-400/10',
      },
      component3: {
        name: 'ShadCN',
        icon: <img src={ShadCNLogo.src} alt="ShadCN" className="h-1/3" />,
        glow: 'shadow-gray-500/12 dark:shadow-gray-400/40 bg-gray-300/5 dark:bg-gray-400/10',
      },
      component4: {
        name: 'TailwindCSS',
        icon: (
          <img src={TailwindLogo.src} alt="TailwindCSS" className="h-1/3" />
        ),
        glow: 'shadow-blue-500/12 dark:shadow-blue-400/40 bg-blue-300/5 dark:bg-blue-400/10',
      },
    },
    {
      component1: {
        name: 'Vue',
        icon: <img src={VueLogo.src} alt="Vue" className="h-1/3" />,
        glow: 'shadow-emerald-500/12 dark:shadow-emerald-400/40 bg-emerald-300/5 dark:bg-emerald-400/10',
      },
      component2: {
        name: 'Nuxt',
        icon: <img src={NuxtLogo.src} alt="Nuxt" className="h-1/3" />,
        glow: 'shadow-green-500/12 dark:shadow-green-400/40 bg-green-300/5 dark:bg-green-400/10',
      },
      component3: {
        name: 'PrimeVue',
        icon: <img src={PrimeVueLogo.src} alt="PrimeVue" className="h-1/3" />,
        glow: 'shadow-gray-500/12 dark:shadow-gray-400/40 bg-gray-300/5 dark:bg-gray-400/10',
      },
      component4: {
        name: 'TailwindCSS',
        icon: (
          <img src={TailwindLogo.src} alt="TailwindCSS" className="h-1/3" />
        ),
        glow: 'shadow-blue-500/12 dark:shadow-blue-400/40 bg-blue-300/5 dark:bg-blue-400/10',
      },
    },
    {
      component1: {
        name: 'Angular',
        icon: <img src={AngularLogo.src} alt="Angular" className="h-1/3" />,
        glow: 'shadow-fuchsia-500/12 dark:shadow-fuchsia-400/40 bg-fuchsia-300/5 dark:bg-fuchsia-400/10',
      },
      component2: {
        name: 'Vite',
        icon: <img src={ViteLogo.src} alt="Vite" className="h-1/3" />,
        glow: 'shadow-yellow-500/12 dark:shadow-yellow-400/40 bg-yellow-300/5 dark:bg-yellow-400/10',
      },
      component3: {
        name: 'Material UI',
        icon: (
          <img src={MaterialUILogo.src} alt="Material UI" className="h-1/3" />
        ),
        glow: 'shadow-red-500/12 dark:shadow-red-400/40 bg-red-300/5 dark:bg-red-400/10',
      },
      component4: {
        name: 'Sass',
        icon: <img src={SassLogo.src} alt="Sass" className="h-1/3" />,
        glow: 'shadow-pink-500/12 dark:shadow-pink-400/40 bg-pink-300/5 dark:bg-pink-400/10',
      },
    },
    {
      component1: {
        name: 'Angular',
        icon: <img src={AngularLogo.src} alt="Angular" className="h-1/3" />,
        glow: 'shadow-violet-500/12 dark:shadow-violet-400/40 bg-violet-300/5 dark:bg-violet-400/10',
      },
      component2: {
        name: 'Vite',
        icon: <img src={ViteLogo.src} alt="Vite" className="h-1/3" />,
        glow: 'shadow-yellow-500/12 dark:shadow-yellow-400/40 bg-yellow-300/5 dark:bg-yellow-400/10',
      },
      component3: {
        name: 'Material UI',
        icon: (
          <img src={MaterialUILogo.src} alt="Material UI" className="h-1/3" />
        ),
        glow: 'shadow-red-500/12 dark:shadow-red-400/40 bg-red-300/5 dark:bg-red-400/10',
      },
      component4: {
        name: 'Sass',
        icon: <img src={SassLogo.src} alt="Sass" className="h-1/3" />,
        glow: 'shadow-pink-500/12 dark:shadow-pink-400/40 bg-pink-300/5 dark:bg-pink-400/10',
      },
    },
    {
      component1: {
        name: 'Svelte',
        icon: <img src={SvelteLogo.src} alt="Svelte" className="h-1/3" />,
        glow: 'shadow-orange-500/12 dark:shadow-orange-400/40 bg-orange-300/5 dark:bg-orange-400/10',
      },
      component2: {
        name: 'SvelteKit',
        icon: <img src={SvelteKitLogo.src} alt="SvelteKit" className="h-1/3" />,
        glow: 'shadow-orange-500/12 dark:shadow-orange-400/40 bg-orange-300/5 dark:bg-orange-400/10',
      },
      component3: {
        name: 'Flowbite',
        icon: <img src={FlowbiteUILogo.src} alt="Flowbite" className="h-1/3" />,
        glow: 'shadow-blue-500/12 dark:shadow-blue-400/40 bg-blue-300/5 dark:bg-blue-400/10',
      },
      component4: {
        name: 'CSS',
        icon: <img src={CSSLogo.src} alt="CSS" className="h-1/3" />,
        glow: 'shadow-blue-500/12 dark:shadow-blue-400/40 bg-blue-300/5 dark:bg-blue-400/10',
      },
    },
  ];

  // Auto-cycle every 3 seconds with fade transition
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setShowGlow(true); // Show glow on change

      setTimeout(() => {
        setCurrentCombination((prev) => (prev + 1) % combinations.length);
        setTimeout(() => {
          setIsTransitioning(false);
          // Fade out glow after 600ms (shorter duration)
          setTimeout(() => {
            setShowGlow(false);
          }, 600);
        }, 50); // Small delay to ensure content changes before fade in
      }, 200); // Fade out duration
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const currentCombo = combinations[currentCombination];

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-6xl">
        <div className="mb-20 text-center">
          <h2 className="mb-6 font-bold text-3xl md:text-4xl">
            stagewise Supports All Frameworks
          </h2>
          <div className="flex justify-center">
            <p className="max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">
              stagewise works with any combination of frameworks, build tools,
              and UI libraries.
            </p>
          </div>
        </div>

        {/* Tech Stack Display */}
        <div className="flex justify-center">
          <div className="w-full max-w-6xl">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
              <div
                className={`aspect-square w-full rounded-xl p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo?.component1?.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo?.component1?.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo?.component1?.name}
                  </div>
                </div>
              </div>

              <div
                className={`aspect-square w-full rounded-xl p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo?.component2?.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo?.component2?.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo?.component2?.name}
                  </div>
                </div>
              </div>

              <div
                className={`aspect-square flex-1 rounded-xl p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo?.component3?.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo?.component3?.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo?.component3?.name}
                  </div>
                </div>
              </div>

              <div
                className={`aspect-square flex-1 rounded-xl p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo?.component4?.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo?.component4?.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo?.component4?.name}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// GradientStarIcon: Star with gradient fill using mask
function _StarIcon({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block ${className}`}
      style={{
        width: '16px',
        height: '16px',
        background: 'var(--color-yellow-500)', // from-indigo-500 to-pink-500
        WebkitMaskImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' fill='black'/></svg>\")",
        maskImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' fill='black'/></svg>\")",
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    />
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
    <div className="relative mx-auto mt-12 min-h-screen w-full max-w-6xl px-4">
      {/* Hero Section */}
      <section className="relative z-10 w-full pb-16 md:pb-20">
        <div className="flex justify-start">
          <div className="w-full max-w-6xl">
            <ScrollReveal>
              <div className="mb-12 flex flex-col items-start px-4 text-left sm:px-0">
                <h1 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-black bg-clip-text text-transparent dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
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
      <section className="relative z-10 w-full py-40 md:py-48">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="mb-20 max-w-3xl pt-8 text-center">
              <h2 className="mb-6 font-bold text-3xl md:text-4xl">
                Why Choose stagewise
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                Discover the powerful features that make stagewise the ultimate
                frontend coding agent
              </p>
            </div>
          </ScrollReveal>
        </div>

        <BentoGrid />
      </section>

      {/* Second Get Started Section */}
      <section className="relative z-10 w-full py-40 md:py-48">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-6xl pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-black bg-clip-text text-transparent dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
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
