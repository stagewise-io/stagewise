'use client';
import Link from 'next/link';
import Image from 'next/image';

import {
  CheckCircle,
  Code,
  RefreshCw,
  Sparkles,
  Globe,
  Shield,
  Rocket,
  Eye,
  Brain,
  TerminalIcon,
} from 'lucide-react';
import { Button } from '@stagewise/stage-ui/components/button';
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
import IdeationChatImage from './ideation_chat.png';
import ImplementChatImage from './implement_chat.png';
import ImproveChatImage from './improve_chat.png';
import MaterialUILogo from './_components/techstack_logos/materialui.png';
import SassLogo from './_components/techstack_logos/sass.png';
import SvelteLogo from './_components/techstack_logos/svelte.png';
import SvelteKitLogo from './_components/techstack_logos/sveltekit.png';
import FlowbiteUILogo from './_components/techstack_logos/flowbite.png';
import CSSLogo from './_components/techstack_logos/css.png';

// Simplified Setup Guide Component
function SimplifiedSetupGuide() {
  return (
    <div className="flex max-w-3xl flex-col items-center text-center">
      <h2 className="mb-6 font-bold text-3xl md:text-4xl">Start in seconds</h2>
      <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
        Get up and running with stagewise in just 3 simple steps
      </p>

      {/* 3 Steps and Command Side by Side */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2 lg:items-center">
        {/* Steps List */}
        <div className="space-y-4 justify-self-center text-left lg:justify-self-start">
          <div className="flex items-start gap-4">
            <div className="glass-body flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-semibold text-blue-600 text-sm dark:bg-blue-400/20 dark:text-blue-400">
              1
            </div>
            <div>
              <h3 className="font-semibold text-lg">Start the dev server</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Start the dev server of your local dev project
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="glass-body flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-semibold text-indigo-600 text-sm dark:bg-indigo-400/20 dark:text-indigo-400">
              2
            </div>
            <div>
              <h3 className="font-semibold text-lg">Open second terminal</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Open a second terminal window in the root of your dev project
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="glass-body flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 font-semibold text-sm text-violet-600 dark:bg-violet-400/20 dark:text-violet-400">
              3
            </div>
            <div>
              <h3 className="font-semibold text-lg">Invoke the command</h3>
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
        <div className="glass-body glass-body-motion max-w-lg rounded-xl bg-blue-50/80 p-6 dark:bg-blue-950/20">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <p className="text-left text-blue-700 text-sm dark:text-blue-300">
              Here for the stagewise integration with other agents?
            </p>
            <Button size="sm" variant="primary" className="shrink-0">
              <Link href="/docs/advanced-usage/use-different-agents">
                Get Started
              </Link>
            </Button>
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
        'Fully local agent architecture with BYOK support. Use own model providers - or get maximum ease of use with our subscription.',
      icon: <Shield className="h-8 w-8 text-violet-500 dark:text-violet-400" />,
      className:
        'aspect-video bg-gradient-to-br from-violet-300/8 via-violet-200/4 to-transparent dark:from-violet-400/20 dark:via-violet-300/10 dark:to-transparent',
      iconPosition: 'bottom-right',
    },
    {
      title: 'Lightning Fast',
      description:
        'When iterating on UX and UI, you need snappy responses. stagewise focusses on maximum speed to deliver an unmatched experience.',
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
              className={`glass-body glass-body-motion glass-body-interactive glass-body-motion-interactive group relative overflow-hidden rounded-2xl bg-white/20 p-6 transition-all duration-300 hover:bg-white/30 dark:bg-transparent dark:hover:bg-white/5 ${feature.className} flex flex-col justify-between`}
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
function CompatibilitySection() {
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
      <div className="max-w-6xl">
        <div className="mb-20 text-center">
          <h2 className="mb-6 font-bold text-3xl md:text-4xl">
            Universal Tech Stack Support
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
          <div className="max-w-2xl">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
              <div
                className={`glass-body aspect-square w-full rounded-full p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo.component1.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo.component1.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo.component1.name}
                  </div>
                </div>
              </div>

              <div
                className={`glass-body aspect-square w-full rounded-full p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo.component2.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo.component2.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo.component2.name}
                  </div>
                </div>
              </div>

              <div
                className={`glass-body aspect-square flex-1 rounded-full p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo.component3.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo.component3.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo.component3.name}
                  </div>
                </div>
              </div>

              <div
                className={`glass-body aspect-square flex-1 rounded-full p-6 text-center transition-all duration-1000 ${
                  !isTransitioning && showGlow
                    ? `shadow-xl ${currentCombo.component4.glow}`
                    : ''
                }`}
              >
                <div
                  className={`flex size-full flex-col items-center justify-center gap-4 transition-opacity duration-200 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {currentCombo.component4.icon}
                  <div className="font-medium text-base text-zinc-800/90 dark:text-zinc-200/90">
                    {currentCombo.component4.name}
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

// Development Steps Slideshow Component
function DevelopmentStepsSlideshow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAutoSwitching, setIsAutoSwitching] = useState(true);

  const steps = [
    {
      id: 'ideate',
      title: 'Ideate',
      icon: <Brain className="size-6 text-blue-500" />,
      color: 'blue',
      description:
        'Transform ideas into visual concepts with AI-powered design suggestions that understand your brand and user needs.',
      features: [
        'Generate whole new sections from simple one shot prompts',
        'Ask stagewise to give feedback on ideas and concepts',
      ],
      gradient: 'from-blue-500/5 to-indigo-500/5',
    },
    {
      id: 'implement',
      title: 'Implement',
      icon: <Code className="size-6 text-indigo-500" />,
      color: 'indigo',
      description:
        'Turn designs into production-ready code with intelligent implementation that respects your design system and codebase structure.',
      features: [
        'Generate clean, maintainable code that follows your patterns',
        'Automatically handle responsive design and accessibility',
        'Integrate with your existing components and design tokens',
        'Maintain consistency across your entire application',
      ],
      gradient: 'from-indigo-500/5 to-blue-500/5',
    },
    {
      id: 'improve',
      title: 'Improve',
      icon: <RefreshCw className="size-6 text-violet-500" />,
      color: 'violet',
      description:
        'Make small or big changes to existing codebases. No matter which framework or design system you use.',
      features: [
        'Get suggestions for UX improvements based on modern design principles',
        'Implement new features and functionality while respecting existing functionality',
        'Optimize for different devices and screen sizes',
      ],
      gradient: 'from-violet-500/5 to-purple-500/5',
    },
  ];

  // Auto-switch steps every 8 seconds
  useEffect(() => {
    if (!isAutoSwitching) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isAutoSwitching, steps.length]);

  const handleStepClick = (index: number) => {
    setCurrentStep(index);
    setIsAutoSwitching(false);
  };

  const getStepColors = (color: string, isActive: boolean) => {
    const colorMap = {
      blue: {
        bg: isActive
          ? 'bg-blue-500/20 dark:bg-blue-400/20 shadow-lg shadow-blue-500/25 dark:shadow-blue-400/25'
          : 'bg-blue-500/5 dark:bg-blue-400/5 hover:bg-blue-500/10 dark:hover:bg-blue-400/10',
        text: isActive
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100',
        icon: isActive
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300',
      },
      indigo: {
        bg: isActive
          ? 'bg-indigo-500/20 dark:bg-indigo-400/20 shadow-lg shadow-indigo-500/25 dark:shadow-indigo-400/25'
          : 'bg-indigo-500/5 dark:bg-indigo-400/5 hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10',
        text: isActive
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100',
        icon: isActive
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300',
      },
      violet: {
        bg: isActive
          ? 'bg-violet-500/20 dark:bg-violet-400/20 shadow-lg shadow-violet-500/25 dark:shadow-violet-400/25'
          : 'bg-violet-500/5 dark:bg-violet-400/5 hover:bg-violet-500/10 dark:hover:bg-violet-400/10',
        text: isActive
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100',
        icon: isActive
          ? 'text-violet-600 dark:text-violet-400'
          : 'text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300',
      },
    };
    return colorMap[color as keyof typeof colorMap];
  };

  return (
    <div className="flex justify-center">
      <div className="max-w-6xl">
        <div className="mb-20 text-center">
          <h2 className="mb-6 font-bold text-3xl md:text-4xl">
            From Start to Finish
          </h2>
          <div className="flex justify-center">
            <p className="max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">
              stagewise supports every phase of your development process, from
              initial concept to final optimization.
            </p>
          </div>
        </div>

        {/* Step Navigation */}
        <div className="mb-12 flex justify-center">
          <div className="flex gap-6">
            {steps.map((step, index) => {
              const colors = getStepColors(step.color, index === currentStep);
              return (
                <button
                  type="button"
                  key={step.id}
                  onClick={() => handleStepClick(index)}
                  className={`glass-body glass-body-motion glass-body-interactive glass-body-motion-interactive flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
                    colors.bg
                  }`}
                >
                  <div className={`transition-colors ${colors.icon}`}>
                    {step.icon}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="relative">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`transition-all duration-700 ${
                index === currentStep
                  ? 'pointer-events-auto translate-y-0 opacity-100 blur-0'
                  : 'pointer-events-none absolute inset-0 translate-y-4 opacity-0 blur-sm'
              }`}
            >
              <div
                className={`glass-body rounded-2xl bg-gradient-to-br p-4 sm:p-6 md:p-8 ${step.gradient}`}
              >
                <div className="grid items-center gap-8 lg:grid-cols-2">
                  {/* Content */}
                  <div>
                    <div className="mb-4 flex items-center gap-3">
                      {step.icon}
                      <h3 className="font-bold text-2xl">{step.title}</h3>
                    </div>
                    <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
                      {step.description}
                    </p>

                    <div className="space-y-4">
                      {step.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                          <span className="text-zinc-700 dark:text-zinc-300">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chat Demo Image */}
                  <div className="flex h-full min-h-[200px] items-center justify-center sm:min-h-[300px] lg:min-h-[400px]">
                    <div className="flex w-full items-center justify-center sm:h-full">
                      <Image
                        src={
                          step.id === 'ideate'
                            ? IdeationChatImage
                            : step.id === 'implement'
                              ? ImplementChatImage
                              : ImproveChatImage
                        }
                        alt={`${step.title} chat demo`}
                        className="h-auto w-4/6 max-w-full rounded-xl sm:h-4/6 sm:w-auto"
                        priority={index === currentStep}
                        quality={100}
                        width={500}
                        height={300}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Customer Reviews Slideshow Component
function CustomerReviewsSlideshow() {
  const [currentReview, setCurrentReview] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const reviews = [
    {
      text: "I'm still amazed about how good stagewise works. I think it's going to become one of my main tools for development.",
      author: 'Noah Yildiz',
      role: 'Co-Founder',
      company: 'Tulip Insights',
      avatar:
        'https://pbs.twimg.com/profile_images/1958073430877548544/wPnU4cYf_400x400.jpg',
    },
    {
      text: 'This tool cuts Design time by 50% ... Just tell Stagewise what you want and watch your UI update in real time.',
      author: 'Harshil Tomar',
      role: 'Co-Founder',
      company: 'vibedocs.pro',
      avatar:
        'https://pbs.twimg.com/profile_images/1947060359862341634/qQsmk06l_400x400.jpg',
    },
    {
      text: 'A must-have tool for any modern development workflow. It simplifies complex tasks and makes coding enjoyable again.',
      author: 'Kevin Harris',
      role: 'Staff Engineer',
      company: 'DevHouse',
      avatar: null,
    },
  ];

  // Auto-cycle every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);

      setTimeout(() => {
        setCurrentReview((prev) => (prev + 1) % reviews.length);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 300);
    }, 6000);

    return () => clearInterval(interval);
  }, [reviews.length]);

  const handleReviewClick = (index: number) => {
    if (index === currentReview) return;

    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentReview(index);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 300);
  };

  return (
    <div className="w-full">
      {/* Review Content */}
      <div className="flex justify-center">
        <div className="w-full max-w-6xl">
          <div className="glass-body rounded-2xl p-2 md:p-4">
            <div className="relative min-h-[300px] py-8">
              {reviews.map((review, index) => (
                <div
                  key={review.text}
                  className={`absolute inset-0 transition-all duration-300 ${
                    index === currentReview && !isTransitioning
                      ? 'translate-y-0 opacity-100 blur-0'
                      : 'pointer-events-none translate-y-4 opacity-0 blur-sm'
                  }`}
                >
                  <div className="flex h-full flex-col items-center justify-center px-4 text-center md:px-8">
                    <blockquote className="mb-8 max-w-4xl text-xl text-zinc-700 leading-relaxed md:text-2xl dark:text-zinc-300">
                      "{review.text}"
                    </blockquote>

                    <div className="flex flex-col items-center gap-4">
                      {review.avatar && (
                        <img
                          src={review.avatar}
                          alt={review.author}
                          className="h-16 w-16 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {review.author}
                        </div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-400">
                          {review.role} at {review.company}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Review Navigation Dots */}
          <div className="mt-8 flex justify-center gap-2">
            {reviews.map((review, index) => (
              <Button
                key={review.text}
                onClick={() => handleReviewClick(index)}
                variant={index === currentReview ? 'primary' : 'secondary'}
                className={`size-3 rounded-full p-0 transition-all ${
                  index === currentReview
                    ? 'w-6 shadow-blue-500/25'
                    : 'w-3 bg-gray-500/20'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// GradientStarIcon: Star with gradient fill using mask
function StarIcon({ className = '' }: { className?: string }) {
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

  // Format star count for display
  const formatStarCount = (count: number | null) => {
    if (count === null) return '3K+'; // Loading state
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K+`;
    }
    return count.toString();
  };

  return (
    <div className="relative mt-12 min-h-screen w-full">
      {/* Hero Section */}
      <section className="container relative z-10 px-4 pb-16 md:pb-20">
        <div className="flex justify-center">
          <div className="max-w-3xl">
            <ScrollReveal>
              <div className="mb-12 flex flex-col items-center px-4 text-center sm:px-0">
                {/* YC Banner */}
                <div className="mb-4 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a
                    href="https://www.ycombinator.com/companies/stagewise"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 font-medium text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                  >
                    <span>
                      Backed by{' '}
                      <span className="ml-2 inline-flex size-4 items-center justify-center bg-[#f26622] align-text-bottom font-normal text-white text-xs">
                        Y
                      </span>
                      <span className="ml-1 font-normal text-[#f26622]">
                        Combinator
                      </span>
                    </span>
                  </a>
                  <a
                    href="https://github.com/stagewise-io/stagewise"
                    onClick={() => posthog?.capture('hero_github_star_click')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 font-medium text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                  >
                    <StarIcon className="size-4 text-yellow-500" />
                    GitHub
                    <div className="glass-inset rounded-full px-1.5 py-0.5 font-medium text-xs text-zinc-500">
                      {formatStarCount(starCount)}
                    </div>
                  </a>
                </div>

                <h1 className="mb-6 font-bold text-3xl tracking-tight md:text-5xl">
                  <span className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-black bg-clip-text text-transparent dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
                    The frontend coding agent for
                    <br />
                    real codebases
                  </span>
                </h1>
                <div className="flex justify-center">
                  <p className="mb-8 max-w-3xl text-center text-lg text-zinc-600 dark:text-zinc-400">
                    stagewise runs locally, lives inside your browser and let's
                    you build app frontends simply by selecting elements and
                    prompting changes.
                  </p>
                </div>

                <Button
                  onClick={() => {
                    const setupSection = document.getElementById('setup-guide');
                    setupSection?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  size="lg"
                  variant="primary"
                  className="mb-6"
                >
                  <TerminalIcon className="size-4 stroke-3" />
                  Install stagewise
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="flex justify-center">
                <div className="group relative mt-8 mb-16 max-w-3xl transform rounded-xl border border-zinc-900/50 shadow-[0_0_40px_rgba(0,0,0,0.25)] dark:border-zinc-100/50 dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]">
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
                      className="glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive flex items-center gap-2 rounded-full bg-white/20 px-6 py-3 font-medium text-zinc-900 shadow-2xl backdrop-blur-md transition-[background-color,backdrop-filter,box-shadow] duration-200 hover:bg-white/30 hover:shadow-3xl hover:backdrop-blur-lg dark:bg-black/20 dark:text-white dark:hover:bg-black/30 dark:hover:backdrop-blur-lg [&>*]:transition-opacity [&>*]:duration-200"
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

      {/* Customer Testimonials Section */}
      <section className="relative z-10 border-zinc-200 border-t py-32 md:py-40 dark:border-zinc-800">
        <div className="container mx-auto px-4">
          <div className="flex justify-center">
            <ScrollReveal>
              <div className="mb-20 max-w-4xl pt-8 text-center">
                <h2 className="mb-6 font-bold text-3xl md:text-4xl">
                  Loved by developers worldwide
                </h2>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={200}>
            <CustomerReviewsSlideshow />
          </ScrollReveal>
        </div>
      </section>

      {/* Simplified Setup Guide Section */}
      <section
        id="setup-guide"
        className="container relative z-10 border-zinc-200 border-t px-4 py-32 md:py-40 dark:border-zinc-800"
      >
        <ScrollReveal>
          <div className="flex justify-center pt-8">
            <SimplifiedSetupGuide />
          </div>
        </ScrollReveal>
      </section>

      {/* Enhanced Bento Grid Features Section */}
      <section className="container relative z-10 border-zinc-200 border-t px-4 py-32 md:py-40 dark:border-zinc-800">
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

      {/* Tech Stack Compatibility Section */}
      <section className="container relative z-10 border-zinc-200 border-t px-4 py-32 md:py-40 dark:border-zinc-800">
        <ScrollReveal>
          <div className="pt-8">
            <CompatibilitySection />
          </div>
        </ScrollReveal>
      </section>

      {/* Development Steps Slideshow Section */}
      <section className="container relative z-10 border-zinc-200 border-t px-4 py-32 md:py-40 dark:border-zinc-800">
        <ScrollReveal>
          <div className="pt-8">
            <DevelopmentStepsSlideshow />
          </div>
        </ScrollReveal>
      </section>

      {/* Second Get Started Section */}
      <section className="container relative z-10 border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="max-w-2xl pt-8 text-center">
              <h2 className="mb-6 font-bold text-3xl md:text-4xl">
                Ready to get started?
              </h2>
              <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
                Install stagewise in your project and start building faster with
                AI-powered frontend development.
              </p>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  onClick={() => {
                    const setupSection = document.getElementById('setup-guide');
                    setupSection?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  size="lg"
                  variant="primary"
                >
                  <TerminalIcon className="size-4 stroke-3" />
                  Install stagewise
                </Button>
                <Button variant="secondary" size="lg">
                  <Link href="/docs">View Documentation</Link>
                </Button>
              </div>

              <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
                Make sure your development server is running first
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
