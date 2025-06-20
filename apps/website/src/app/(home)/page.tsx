'use client';
import Link from 'next/link';
import {
  ArrowRight,
  Github,
  Zap,
  Settings,
  Link2,
  Feather,
  Layers,
  MessageSquare,
  User,
} from 'lucide-react';
import { WebsiteDemo } from '@/components/landing/website-demo';
import { AnimatedBackground } from '@/components/landing/animated-background';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { GradientButton } from '@/components/landing/gradient-button';
import { Clipboard } from '../../components/clipboard';
import { usePostHog } from 'posthog-js/react';
import Image from 'next/image';
import AdobeLogo from './_components/company_logos/adobe.png';
import AirBnBLogo from './_components/company_logos/airbnb.png';
import AmazonLogo from './_components/company_logos/amazon.png';
import MicrosoftLogo from './_components/company_logos/microsoft.png';
import OracleLogo from './_components/company_logos/oracle.png';
import SamsungLogo from './_components/company_logos/samsung.png';
import ZendeskLogo from './_components/company_logos/zendesk.png';
import ReactLogo from './_components/plugin_logos/react.svg';
import VueLogo from './_components/plugin_logos/vue.svg';
import AngularLogo from './_components/plugin_logos/angular.svg';

import CursorLogo from './_components/ide_logos/cursor.png';
import WindsurfLogo from './_components/ide_logos/windsurf.png';
import GitHubCopilotLogo from './_components/ide_logos/github_copilot.png';
import ClineLogo from './_components/ide_logos/cline.png';
import RooCodeLogo from './_components/ide_logos/roo_code.png';

import ReactFrameworkLogo from './_components/framework_logos/react.png';
import VueFrameworkLogo from './_components/framework_logos/vue.png';
import AngularFrameworkLogo from './_components/framework_logos/angular.png';
import SvelteFrameworkLogo from './_components/framework_logos/svelte.png';
import NextFrameworkLogo from './_components/framework_logos/next.png';
import NuxtFrameworkLogo from './_components/framework_logos/nuxt.png';

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900 dark:bg-black dark:text-white">
      <AnimatedBackground />

      {/* Hero Section */}
      <section className="container relative z-10 mx-auto px-4 py-24 md:py-32">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <h1 className="mb-6 font-bold text-4xl tracking-tight md:text-6xl">
                <span className="bg-gradient-to-tr from-blue-700 via-violet-500 to-indigo-800 bg-clip-text text-transparent dark:from-cyan-400 dark:via-violet-500 dark:to-indigo-400">
                  Visually prompt any dev agent.
                </span>
                <br />
                Right on your localhost
              </h1>
              <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
                Our toolbar connects your app frontend to your favorite code
                agent and lets you edit your web app UI with prompts.
              </p>
              <div className="mb-8 flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="#quickstart"
                  onClick={() => posthog?.capture('hero_get_started_click')}
                >
                  <GradientButton size="lg">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </GradientButton>
                </Link>
                <Link
                  href="https://github.com/stagewise-io/stagewise"
                  onClick={() => posthog?.capture('hero_github_star_click')}
                >
                  <GradientButton variant="outline" size="lg">
                    <StarIcon className="mr-2 h-4 w-4 text-yellow-500" />
                    Star on GitHub
                    <div className="ml-1 rounded-full bg-zinc-500/10 px-1.5 py-0.5 font-medium text-xs text-zinc-500">
                      3K+
                    </div>
                  </GradientButton>
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center">
                  <div className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                  Wide dev agent support.
                </div>
                <div className="flex items-center">
                  <div className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                  Works with all frameworks
                </div>
                <div className="flex items-center">
                  <div className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                  Open Source
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="mx-auto max-w-3xl scale-[1.01] transform shadow-[0_0_50px_rgba(128,90,213,0.3)] transition-transform duration-300">
              <WebsiteDemo />
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="mt-32 mb-8 w-full">
              <p className="mx-auto mb-16 text-center text-base text-zinc-600 dark:text-zinc-400">
                embraced by engineers from leading companies
              </p>
              <div className="flex flex-row flex-wrap items-center justify-center gap-x-20 gap-y-12">
                <Image
                  src={AdobeLogo}
                  alt="Adobe"
                  className="w-20 opacity-60 dark:invert"
                />
                <Image
                  src={AirBnBLogo}
                  alt="AirBnB"
                  className="w-20 opacity-60 dark:invert"
                />
                <Image
                  src={AmazonLogo}
                  alt="Amazon"
                  className="w-24 opacity-60 dark:invert"
                />
                <Image
                  src={MicrosoftLogo}
                  alt="Microsoft"
                  className="w-24 opacity-60 dark:invert"
                />
                <Image
                  src={OracleLogo}
                  alt="Oracle"
                  className="w-24 opacity-60 dark:invert"
                />
                <Image
                  src={SamsungLogo}
                  alt="Samsung"
                  className="w-24 opacity-60 dark:invert"
                />
                <Image
                  src={ZendeskLogo}
                  alt="Zendesk"
                  className="w-16 opacity-60 dark:invert"
                />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Demo Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-16 md:py-24 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto mb-12 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              See It In Action
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Watch how stagewise connects your browser UI to your code editor,
              providing real-time context for your AI agents.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mx-auto max-w-4xl scale-[1.02] transform overflow-hidden rounded-xl border border-indigo-900/50 shadow-[0_0_40px_rgba(128,90,213,0.25)] transition-transform duration-500">
            <video
              src="https://github.com/stagewise-io/assets/raw/refs/heads/main/edited/0-3-0-plugin-release/standard-demo.mp4"
              width={1200}
              height={675}
              className="w-full"
              autoPlay
              muted
              loop
              preload="auto"
              playsInline
            />
          </div>
        </ScrollReveal>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800"
      >
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">Features</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              The stagewise toolbar makes it incredibly easy to edit your
              frontend code with AI agents
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {[
            {
              icon: <Zap className="h-6 w-6" />,
              title: 'Works out of the box',
              description: 'Simple setup with minimal configuration required',
              delay: 100,
            },
            {
              icon: <Settings className="h-6 w-6" />,
              title: 'Customizable',
              description:
                'Use your own configuration file to tailor the experience',
              delay: 200,
            },
            {
              icon: <Link2 className="h-6 w-6" />,
              title: 'Connect to MCP',
              description:
                'Connect to your own MCP server for enhanced capabilities',
              delay: 300,
            },
            {
              icon: <Feather className="h-6 w-6" />,
              title: 'Zero impact',
              description: 'Does not impact bundle size of your production app',
              delay: 400,
            },
            {
              icon: <Layers className="h-6 w-6" />,
              title: 'Rich context',
              description:
                'Sends DOM elements, screenshots & metadata to your AI agent',
              delay: 500,
            },
            {
              icon: <MessageSquare className="h-6 w-6" />,
              title: 'Live comments',
              description: 'Comment directly on live elements in the browser',
              delay: 600,
            },
          ].map((feature, _i) => (
            <ScrollReveal key={feature.title} delay={feature.delay}>
              <div className="group -translate-y-1 rounded-2xl border border-zinc-500/20 bg-white p-6 shadow-2xl shadow-[rgba(128,90,213,0.15)] transition-all duration-300 dark:border-indigo-800 dark:bg-zinc-900">
                <div className="mb-4 inline-flex rounded-lg bg-indigo-100 p-3 transition-colors dark:bg-indigo-900/20">
                  {feature.icon}
                </div>
                <h3 className="mb-2 font-semibold text-xl">{feature.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Framework Support Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-16 md:py-24 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              Works With Your Stack
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              stagewise integrates seamlessly with popular frontend frameworks.
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-8">
          {[
            {
              name: 'React',
              logo: ReactFrameworkLogo,
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/react-example',
            },
            {
              name: 'Vue',
              logo: VueFrameworkLogo,
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/vue-example',
            },
            {
              name: 'Angular',
              logo: AngularFrameworkLogo,
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/angular-example',
            },
            {
              name: 'Svelte',
              logo: SvelteFrameworkLogo,
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/svelte-kit-example',
            },
            {
              name: 'Next.js',
              logo: NextFrameworkLogo,
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/next-example',
            },
            {
              name: 'Nuxt',
              logo: NuxtFrameworkLogo,
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/nuxt-example',
            },
          ].map((framework, i) => (
            <ScrollReveal key={framework.name} delay={i * 100} direction="up">
              <Link
                href={framework.href}
                className="group hover:-translate-y-0.5 flex cursor-pointer items-center gap-2 rounded-full border border-zinc-500/30 bg-zinc-50 px-6 py-2 shadow-[0_0_20px_rgba(128,90,213,0.15)] transition-all duration-300 ease-out hover:bg-white dark:border-indigo-800 dark:bg-zinc-900"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  posthog?.capture('framework_link_click', {
                    framework: framework.name,
                  })
                }
              >
                <Image
                  src={framework.logo}
                  alt={framework.name}
                  className="size-6"
                />
                <span className="font-medium">{framework.name}</span>
              </Link>
            </ScrollReveal>
          ))}
        </div>
        <p className="mx-auto mt-12 w-full text-center text-sm text-zinc-500 dark:text-zinc-500">
          Click on a framework to see an example project.
        </p>
      </section>

      {/* Testimonials Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              Loved by Developers Worldwide
            </h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Don't just take our word for it. Here's what developers are saying
              about their experience.
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-3">
          {[
            {
              quote:
                'This Cursor Extension is awesome. Accurate tweaking of UI was always a struggle, but @stagewise_io allows you to bring full context to Cursor, just point and command.',
              name: 'Jason Zhou',
              role: 'Product engineer @ TaskMaster AI',
              avatar:
                'https://pbs.twimg.com/profile_images/1613651966663749632/AuQiWkVc_400x400.jpg',
            },
            {
              quote:
                'How did I even use Cursor before this?! Amazing extension.',
              name: 'Dennis Cutraro',
              role: 'Founder @ unfuture',
              avatar: null,
            },
            {
              quote:
                "This is an amazing extension. The setup is quite simple, and it impresses from the very beginning. I was surprised how well it worked right away, even in a poorly designed brownfield project. This is only the beginning, I'm excited to see how it develops.",
              name: 'Egor Koldasov',
              role: '',
              avatar: null,
            },
            {
              quote:
                'Just tried Stagewise plugin for Cursor - point and tell what to change. Way easier than describing UI elements in prompts.',
              name: 'Renat Abbiazov',
              role: '',
              avatar:
                'https://pbs.twimg.com/profile_images/1641815076477837313/1IfZhFZM_400x400.jpg',
            },
            {
              quote:
                "Our team's productivity has skyrocketed since we adopted Stagewise. Collaboration between designers and developers has never been smoother.",
              name: 'David Garcia',
              role: 'Engineering Manager @ FutureWorks',
              avatar: null,
            },
            {
              quote:
                "stagewise in cursor is different gravy. UI changes for code you didn't write has never been easier",
              name: 'Kareem',
              role: '',
              avatar:
                'https://pbs.twimg.com/profile_images/1923032215954305024/6Y7NyOBy_400x400.jpg',
            },
            {
              quote:
                'stagewise is what a good interface for AI should look like',
              name: 'chocologist',
              role: '',
              avatar:
                'https://pbs.twimg.com/profile_images/1866724361857798154/Ujx2G3m0_400x400.jpg',
            },
            {
              quote:
                "🚨 VIBE CODERS: If you are using @cursor and working on a frontend, install stagewise immediately. Go in to debt if you have to. ps - it's free :)",
              name: 'John Schoenith',
              role: '',
              avatar:
                'https://pbs.twimg.com/profile_images/1905304449016627200/2GQ72XW5_400x400.jpg',
            },
            {
              quote:
                'A must-have tool for any modern development workflow. It simplifies complex tasks and makes coding enjoyable again.',
              name: 'Kevin Harris',
              role: 'Staff Engineer @ DevHouse',
              avatar: null,
            },
          ].map((testimonial, i) => (
            <ScrollReveal key={testimonial.name} delay={i * 100}>
              <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-500/20 bg-white p-6 shadow-[rgba(128,90,213,0.1)] shadow-lg transition-all duration-300 dark:border-indigo-800 dark:bg-zinc-900">
                <div className="mb-4">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    "{testimonial.quote}"
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {testimonial.avatar ? (
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full border border-zinc-200 dark:border-zinc-800"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-indigo-100 dark:border-zinc-800 dark:bg-indigo-900/20">
                      <User className="h-6 w-6" />{' '}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-zinc-500">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Plugin Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-16 md:py-24 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              Upgrade Your Workflow With Plugins
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              stagewise can be easily extended to fit your needs with existing
              plugins - or you simply build your own.
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {[
            {
              icon: <Image src={ReactLogo} alt="React" className="size-8" />,
              title: 'React',
              description: 'Improve prompts with context on your React app.',
              delay: 100,
            },
            {
              icon: <Image src={VueLogo} alt="Vue" className="size-8" />,
              title: 'Vue',
              description:
                'Get more accurate prompts with info on selected Vue components.',
              delay: 300,
            },
            {
              icon: (
                <Image src={AngularLogo} alt="Angular" className="size-8" />
              ),
              title: 'Angular',
              description: 'First-class support for Angular apps.',
              delay: 500,
            },
          ].map((feature, _i) => (
            <ScrollReveal key={feature.title} delay={feature.delay}>
              <div className="group -translate-y-1 h-full rounded-2xl border border-zinc-500/20 bg-white p-6 shadow-2xl shadow-[rgba(128,90,213,0.15)] transition-all duration-300 dark:border-indigo-800 dark:bg-zinc-900">
                <div className="mb-4 inline-flex rounded-lg bg-zinc-50 p-3 transition-colors dark:bg-zinc-900/10">
                  {feature.icon}
                </div>
                <h3 className="mb-2 font-semibold text-xl">{feature.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Quickstart Section */}
      <section
        id="quickstart"
        className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 text-center md:py-32 dark:border-zinc-800"
      >
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-10 font-bold text-3xl md:text-4xl">Quickstart</h2>
            <div className="space-y-20">
              {/* Step 1: Install VS Code Extension */}
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-bold text-slate-900 text-xl dark:bg-zinc-800 dark:text-white">
                  1
                </div>
                <div>
                  <h3 className="mb-4 font-semibold text-2xl">
                    Install the code editor extension
                  </h3>
                  <p className="mb-4 text-zinc-600 dark:text-zinc-400">
                    Install the extension from the extension store of your
                    favorite code editor.
                  </p>
                  <Link
                    href="https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension"
                    onClick={() =>
                      posthog?.capture('quickstart_get_extension_click')
                    }
                  >
                    <GradientButton>
                      Get from VS Code Marketplace
                      <ArrowRight className="ml-2 size-4" />
                    </GradientButton>
                  </Link>
                </div>
              </div>

              {/* Step 2: Install and inject the toolbar */}
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-bold text-slate-900 text-xl dark:bg-zinc-800 dark:text-white">
                  2
                </div>
                <div>
                  <h3 className="mb-4 font-semibold text-2xl">
                    Install and inject the toolbar
                  </h3>
                  <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-100 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">
                      🪄 Auto-Install the toolbar (AI-guided):
                    </p>
                    <ol className="mt-2 list-decimal pl-5 text-zinc-600 dark:text-zinc-400">
                      <li>
                        In Cursor, Press{' '}
                        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                          CMD + Shift + P
                        </code>
                      </li>
                      <li>
                        Enter{' '}
                        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                          setupToolbar
                        </code>
                      </li>
                      <li>
                        Execute the command and the toolbar will init
                        automatically 🦄
                      </li>
                    </ol>
                  </div>
                  <p className="mb-4 text-center text-zinc-600 dark:text-zinc-400">
                    Or follow the manual way:
                  </p>
                  <Clipboard
                    className="mx-auto"
                    text="pnpm i -D @stagewise/toolbar"
                  />
                  ⚡️ The toolbar will <strong>automatically connect</strong> to
                  the extension!
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    Check out the{' '}
                    <Link href="/docs/quickstart" className="underline">
                      Quickstart Guide
                    </Link>{' '}
                    for the React, Next.js, Vue and Nuxt SDKs.
                  </p>
                </div>
              </div>

              {/* Step 3: tart vibe coding */}
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-bold text-slate-900 text-xl dark:bg-zinc-800 dark:text-white">
                  3
                </div>
                <div>
                  <h3 className="mb-4 font-semibold text-2xl">
                    Start your visual vibe coding journey! 🎉
                  </h3>
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    Click on the chat icon in the bottom right corner of your
                    app to get started.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Agent Support Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              Agent Support
            </h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Compatible with all popular AI coding assistants
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8">
          {[
            {
              name: 'Cursor',
              logo: CursorLogo,
            },
            {
              name: 'Windsurf',
              logo: WindsurfLogo,
            },
            {
              name: 'GitHub Copilot',
              logo: GitHubCopilotLogo,
            },
            {
              name: 'Cline',
              logo: ClineLogo,
            },
            {
              name: 'Roo Code',
              logo: RooCodeLogo,
            },
          ].map((framework, i) => (
            <ScrollReveal key={framework.name} delay={i * 100} direction="up">
              <div className="group flex items-center gap-2 rounded-full border border-zinc-500/30 bg-zinc-50 px-6 py-2 shadow-[0_0_20px_rgba(128,90,213,0.15)] transition-all duration-300 dark:border-indigo-800 dark:bg-zinc-900">
                <Image
                  src={framework.logo}
                  alt={framework.name}
                  className="h-6 w-6"
                />
                <span className="font-medium">{framework.name}</span>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-16 md:py-24 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl rounded-lg bg-gradient-to-br from-zinc-100 to-indigo-200/30 p-12 shadow-[0_0_50px_rgba(128,90,213,0.2)] transition-all duration-500 dark:from-zinc-900 dark:to-indigo-900/30">
            <h2 className="mb-6 text-center font-bold text-3xl md:text-4xl">
              Ready to enhance your AI coding experience?
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-center text-xl text-zinc-700 dark:text-zinc-300">
              Join our growing community of developers using stagewise to
              supercharge their AI-powered coding workflow.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link href="https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension">
                <GradientButton size="lg">
                  Install VS Code Extension
                </GradientButton>
              </Link>
              <Link href="https://github.com/stagewise-io/stagewise">
                <GradientButton variant="outline" size="lg">
                  <Github className="mr-2 h-4 w-4" />
                  View on GitHub
                </GradientButton>
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
