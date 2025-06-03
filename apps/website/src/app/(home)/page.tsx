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
} from 'lucide-react';
import { WebsiteDemo } from '@/components/landing/website-demo';
import { AnimatedBackground } from '@/components/landing/animated-background';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { GradientButton } from '@/components/landing/gradient-button';
import { Clipboard } from '../../components/clipboard';
import { usePostHog } from 'posthog-js/react';

// GradientStarIcon: Star with gradient fill using mask
function GradientStarIcon({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block ${className}`}
      style={{
        width: '16px',
        height: '16px',
        background: 'linear-gradient(to right, #a21caf, #ec4899)', // from-purple-500 to-pink-500
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
                Eyesight for your
                <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  {' '}
                  AI-powered{' '}
                </span>
                Code Editor
              </h1>
              <p className="mx-auto mb-8 max-w-2xl text-gray-600 text-lg dark:text-gray-400">
                Connect your frontend UI to your code AI agents. Select
                elements, leave comments, and let your AI do the magic.
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
                    <GradientStarIcon className="mr-2 h-4 w-4" />
                    Star on GitHub
                  </GradientButton>
                </Link>
              </div>
              <div className="flex items-center justify-center gap-4 text-gray-600 text-sm dark:text-gray-400">
                <div className="flex items-center">
                  <div className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                  VS Code Extension
                </div>
                <div className="flex items-center">
                  <div className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                  Cursor Support
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
        </div>
      </section>

      {/* Demo Section */}
      <section className="container relative z-10 mx-auto border-gray-200 border-t px-4 py-16 md:py-24 dark:border-gray-800">
        <ScrollReveal>
          <div className="mx-auto mb-12 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              See It In Action
            </h2>
            <p className="mx-auto max-w-2xl text-gray-600 text-lg dark:text-gray-400">
              Watch how stagewise connects your browser UI to your code editor,
              providing real-time context for your AI agents.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mx-auto max-w-4xl scale-[1.02] transform overflow-hidden rounded-xl border border-purple-900/50 shadow-[0_0_40px_rgba(128,90,213,0.25)] transition-transform duration-500">
            <video
              src="https://github.com/stagewise-io/assets/raw/refs/heads/main/media/demo-video-v1.mp4"
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
        className="container relative z-10 mx-auto border-gray-200 border-t px-4 py-24 md:py-32 dark:border-gray-800"
      >
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">Features</h2>
            <p className="text-gray-600 text-lg dark:text-gray-400">
              The stagewise Toolbar makes it incredibly easy to edit your
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
          ].map((feature, i) => (
            <ScrollReveal key={feature.title} delay={feature.delay}>
              <div className="group -translate-y-1 rounded-lg border border-purple-600 bg-gray-100 p-6 shadow-[0_0_30px_rgba(128,90,213,0.15)] transition-all duration-300 dark:border-purple-800 dark:bg-gray-900">
                <div className="mb-4 inline-flex rounded-lg bg-purple-100 p-3 transition-colors dark:bg-purple-900/20">
                  {feature.icon}
                </div>
                <h3 className="mb-2 font-semibold text-xl">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Framework Support Section */}
      <section className="container relative z-10 mx-auto border-gray-200 border-t px-4 py-16 md:py-24 dark:border-gray-800">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              Works With Your Stack
            </h2>
            <p className="mx-auto max-w-2xl text-gray-600 text-lg dark:text-gray-400">
              stagewise integrates seamlessly with popular frontend frameworks
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8">
          {[
            {
              name: 'React',
              color: 'bg-blue-500',
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/react-example',
            },
            {
              name: 'Vue',
              color: 'bg-green-500',
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/vue-example',
            },
            {
              name: 'Svelte',
              color: 'bg-orange-500',
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/svelte-kit-example',
            },
            {
              name: 'Next.js',
              color: 'bg-gray-500',
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/next-example',
            },
            {
              name: 'Nuxt',
              color: 'bg-green-600',
              href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/nuxt-example',
            },
          ].map((framework, i) => (
            <ScrollReveal key={framework.name} delay={i * 100} direction="up">
              <Link
                href={framework.href}
                className="group flex cursor-pointer items-center gap-2 rounded-full border border-purple-600 bg-gray-100 px-6 py-3 shadow-[0_0_20px_rgba(128,90,213,0.15)] transition-all duration-300 dark:border-purple-800 dark:bg-gray-900"
                target="_blank"
                onClick={() =>
                  posthog?.capture('framework_link_click', {
                    framework: framework.name,
                  })
                }
              >
                <div className={`h-3 w-3 rounded-full ${framework.color}`} />
                <span className="font-medium">{framework.name}</span>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Quickstart Section */}
      <section
        id="quickstart"
        className="container relative z-10 mx-auto border-gray-200 border-t px-4 py-24 md:py-32 dark:border-gray-800"
      >
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-10 font-bold text-3xl md:text-4xl">Quickstart</h2>
            <div className="space-y-12">
              {/* Step 1: Install VS Code Extension */}
              <div className="flex flex-col items-start gap-8 md:flex-row">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 font-bold text-slate-900 text-xl dark:bg-gray-800 dark:text-white">
                  1
                </div>
                <div>
                  <h3 className="mb-4 font-semibold text-2xl">
                    Install the VS Code extension
                  </h3>
                  <p className="mb-4 text-gray-600 dark:text-gray-400">
                    Install the extension from the Visual Studio Marketplace.
                  </p>
                  <Link
                    href="https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension"
                    onClick={() =>
                      posthog?.capture('quickstart_get_extension_click')
                    }
                  >
                    <GradientButton>Get Extension</GradientButton>
                  </Link>
                </div>
              </div>
              {/* Step 2: Install and inject the toolbar */}
              <div className="flex flex-col items-start gap-8 md:flex-row">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 font-bold text-slate-900 text-xl dark:bg-gray-800 dark:text-white">
                  2
                </div>
                <div>
                  <h3 className="mb-4 font-semibold text-2xl">
                    Install and inject the toolbar
                  </h3>
                  <div className="mb-4 rounded-lg border border-gray-200 bg-gray-100 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      🪄 Auto-Install the toolbar (AI-guided):
                    </p>
                    <ol className="mt-2 list-decimal pl-5 text-gray-600 dark:text-gray-400">
                      <li>
                        In Cursor, Press{' '}
                        <code className="rounded bg-gray-200 px-1 dark:bg-gray-800">
                          CMD + Shift + P
                        </code>
                      </li>
                      <li>
                        Enter{' '}
                        <code className="rounded bg-gray-200 px-1 dark:bg-gray-800">
                          setupToolbar
                        </code>
                      </li>
                      <li>
                        Execute the command and the toolbar will init
                        automatically 🦄
                      </li>
                    </ol>
                  </div>
                  <p className="mb-4 text-gray-600 dark:text-gray-400">
                    Or follow the manual way:
                  </p>
                  <Clipboard text="pnpm i -D @stagewise/toolbar" />
                  ⚡️ The toolbar will <strong>automatically connect</strong> to
                  the extension!
                  <p className="mt-4 text-gray-600 text-sm dark:text-gray-400">
                    Check out the{' '}
                    <Link href="/docs/quickstart" className="underline">
                      Quickstart Guide
                    </Link>{' '}
                    for the React, Next.js, Vue and Nuxt SDKs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Agent Support Section */}
      <section className="container relative z-10 mx-auto border-gray-200 border-t px-4 py-24 md:py-32 dark:border-gray-800">
        <ScrollReveal>
          <div className="mx-auto mb-16 max-w-4xl">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl">
              Agent Support
            </h2>
            <p className="text-gray-600 text-lg dark:text-gray-400">
              Compatible with popular AI coding assistants
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mx-auto max-w-4xl rounded-lg bg-gradient-to-br from-gray-100 to-purple-200/30 p-12 shadow-[0_0_50px_rgba(128,90,213,0.2)] transition-all duration-500 dark:from-gray-900 dark:to-purple-900/30">
            <table className="w-full">
              <thead>
                <tr className="border-gray-300 border-b dark:border-gray-800">
                  <th className="px-4 py-3 text-left font-semibold">Agent</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-gray-300 border-b dark:border-gray-700">
                  <td className="px-4 py-3">Cursor</td>
                  <td className="px-4 py-3 text-green-500">Supported (v0.1)</td>
                </tr>
                <tr className="border-gray-300 border-b dark:border-gray-700">
                  <td className="px-4 py-3">GitHub Copilot</td>
                  <td className="px-4 py-3 text-yellow-500">In Progress</td>
                </tr>
                <tr className="border-gray-300 border-b dark:border-gray-700">
                  <td className="px-4 py-3">Windsurf</td>
                  <td className="px-4 py-3 text-green-500">Supported (v0.2)</td>
                </tr>
                <tr className="border-gray-300 border-b dark:border-gray-700">
                  <td className="px-4 py-3">Cline</td>
                  <td className="px-4 py-3 text-red-500">Not Supported</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Zed</td>
                  <td className="px-4 py-3 text-red-500">Not Supported</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </section>

      {/* CTA Section */}
      <section className="container relative z-10 mx-auto border-gray-200 border-t px-4 py-16 md:py-24 dark:border-gray-800">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl rounded-lg bg-gradient-to-br from-gray-100 to-purple-200/30 p-12 shadow-[0_0_50px_rgba(128,90,213,0.2)] transition-all duration-500 dark:from-gray-900 dark:to-purple-900/30">
            <h2 className="mb-6 text-center font-bold text-3xl md:text-4xl">
              Ready to enhance your AI coding experience?
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-center text-gray-700 text-xl dark:text-gray-300">
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
