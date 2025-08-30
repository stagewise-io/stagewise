'use client';

import { useState, useEffect } from 'react';
import { CopyIcon, CheckIcon } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { usePostHog } from 'posthog-js/react';
import { Logo } from '@/components/landing/logo';
import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';
import { cn } from '@stagewise/ui/lib/utils';

export default function MigrateToCLI() {
  const posthog = usePostHog();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    posthog?.capture('migration_page_viewed');
  }, [posthog]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-black dark:text-white">
      {/* Hero Section */}
      <section className="container relative z-10 mx-auto px-4 pt-32 pb-12">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <div className="relative inline-block size-16 scale-95 overflow-hidden rounded-full shadow-lg ring-1 ring-black/20 ring-inset">
                <AnimatedGradientBackground className="absolute inset-0 size-full" />
                <Logo
                  className="absolute top-[24%] left-[24%] z-10 size-1/2 drop-shadow-xs"
                  color="white"
                />
              </div>
              <h1 className="mb-6 font-bold text-2xl tracking-tight md:text-4xl">
                <span className="bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text text-transparent dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
                  Welcome to stagewise!
                </span>
              </h1>
              <div className="flex flex-col items-center gap-8">
                <p className="mb-8 text-center text-zinc-600 dark:text-zinc-400">
                  Follow these simple steps to get started:
                </p>

                <div className="w-full max-w-2xl text-left">
                  <ol className="space-y-6">
                    <li className="flex gap-4">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black font-semibold text-white dark:from-zinc-100 dark:via-zinc-300 dark:to-white dark:text-black">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-white/8 to-white/15" />
                        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.4),inset_0_0_2px_0.5px_rgba(255,255,255,0.25),inset_0_0_4px_1px_rgba(255,255,255,0.15),inset_0_0_8px_2px_rgba(255,255,255,0.08),0_0_0_0.5px_rgba(255,255,255,0.05)]" />
                        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/5 to-transparent" />
                        <span className="relative z-10">1</span>
                      </div>
                      <div>
                        <h3 className="mb-1 font-semibold text-lg text-zinc-900 dark:text-zinc-100">
                          Start your local app in dev mode
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          <code>pnpm dev</code>&nbsp; or &nbsp;
                          <code>npm run dev</code>
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black font-semibold text-white dark:from-zinc-100 dark:via-zinc-300 dark:to-white dark:text-black">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-white/8 to-white/15" />
                        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.4),inset_0_0_2px_0.5px_rgba(255,255,255,0.25),inset_0_0_4px_1px_rgba(255,255,255,0.15),inset_0_0_8px_2px_rgba(255,255,255,0.08),0_0_0_0.5px_rgba(255,255,255,0.05)]" />
                        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/5 to-transparent" />
                        <span className="relative z-10">2</span>
                      </div>
                      <div>
                        <h3 className="mb-1 font-semibold text-lg text-zinc-900 dark:text-zinc-100">
                          Open a new terminal and navigate to your app directory
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          For example: <code>cd ~/projects/my-website</code>
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black font-semibold text-white dark:from-zinc-100 dark:via-zinc-300 dark:to-white dark:text-black">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-white/8 to-white/15" />
                        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.4),inset_0_0_2px_0.5px_rgba(255,255,255,0.25),inset_0_0_4px_1px_rgba(255,255,255,0.15),inset_0_0_8px_2px_rgba(255,255,255,0.08),0_0_0_0.5px_rgba(255,255,255,0.05)]" />
                        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/5 to-transparent" />
                        <span className="relative z-10">3</span>
                      </div>
                      <div>
                        <h3 className="mb-2 font-semibold text-lg text-zinc-900 dark:text-zinc-100">
                          Run stagewise in the terminal
                        </h3>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 p-3 pr-4 transition-all duration-200 hover:border-zinc-300 hover:bg-zinc-200 active:scale-95 sm:w-auto dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800',
                          )}
                          onClick={() => {
                            window.parent.postMessage(
                              { command: 'openTerminal' },
                              '*',
                            );
                            posthog?.capture(
                              'open_terminal_in_getting_started',
                            );
                            setCopied(true);
                            setTimeout(() => setCopied(false), 4000);
                          }}
                          aria-label="Copy to clipboard"
                        >
                          <span className="select-all pr-4 font-mono text-sm">
                            npx stagewise@latest -b
                          </span>
                          {copied ? (
                            <CheckIcon className="h-4 w-4 text-green-500" />
                          ) : (
                            <CopyIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </li>
                  </ol>
                </div>

                <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  If you're using pnpm, run{' '}
                  <code className="px-1 font-semibold">
                    pnpm dlx stagewise@latest -b
                  </code>{' '}
                  instead.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-16 dark:border-zinc-800">
        <ScrollReveal delay={1}>
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-2xl md:text-3xl">Need Help?</h2>
            <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
              If you encounter any issues while getting started, we're here to
              help.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => {
                  window.parent.postMessage(
                    {
                      command: 'openDiscord',
                      url: 'https://discord.gg/6gjx9ESbhf',
                    },
                    '*',
                  );
                  posthog?.capture('discord_link_clicked');
                }}
                className="inline-flex cursor-pointer items-center gap-2 border-none bg-transparent font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Join Discord
              </button>
            </div>
            <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-500">
              https://discord.gg/6gjx9ESbhf
            </p>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
