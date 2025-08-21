'use client';

import { useState, useEffect } from 'react';
import {
  CopyIcon,
  CheckIcon,
  TerminalIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { Button } from '@stagewise/ui/components/button';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { usePostHog } from 'posthog-js/react';
import { Logo } from '@/components/landing/logo';
import { AnimatedGradientBackground } from '@/components/landing/animated-gradient-background';

export default function MigrateToCLI() {
  const posthog = usePostHog();
  const [copied, setCopied] = useState(false);
  const [terminalStarted, setTerminalStarted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    posthog?.capture('migration_page_viewed');
  }, [posthog]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-black dark:text-white">
      {/* Hero Section */}
      <section className="container relative z-10 mx-auto px-4 pt-20 pb-12">
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
                  Your stagewise setup
                  <br />
                  needs an upgrade
                </span>
              </h1>

              <div className="mx-auto mb-8 max-w-2xl">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20">
                  <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex w-full items-center justify-between p-3 text-left transition-colors dark:border-yellow-700 dark:bg-yellow-900/20 dark:hover:bg-yellow-800/40"
                  >
                    <h3 className="font-medium text-sm text-zinc-600 dark:text-zinc-400">
                      We are migrating to the stagewise CLI, here's why:
                    </h3>
                    <ChevronDownIcon
                      className={`h-4 w-4 text-zinc-500 transition-transform dark:text-zinc-500 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="border-yellow-200 border-t px-3 py-3 dark:border-yellow-700">
                      <p className="text-left text-sm text-zinc-600 dark:text-zinc-400">
                        Many users complained that the stagewise setup was too
                        complex - installing an additional dependency had many
                        drawbacks.
                        <br />
                        <br />
                        To make the use of stagewise as easy as possible, we are
                        migrating to the stagewise CLI:
                        <ul className="mt-2 list-inside list-disc">
                          <li>
                            No need for dependencies in your web app anymore
                          </li>
                          <li>You always use the latest toolbar version</li>
                          <li>
                            The CLI automatically loads the right plugins for
                            your app
                          </li>
                          <li>
                            If the app crashes, the toolbar will still be
                            present
                          </li>
                        </ul>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center gap-8">
                <p className="mb-1 text-center font-medium text-md text-zinc-600 dark:text-zinc-400">
                  Here's what you need to do to upgrade:
                </p>
                <div className="w-full max-w-md">
                  <p className="mb-6 text-center font-semibold text-lg text-zinc-700 dark:text-zinc-300">
                    1. Remove stagewise packages
                  </p>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center gap-3">
                        <span className="text-start font-medium text-sm text-zinc-700 dark:text-zinc-300">
                          Remove all old packages (
                          <code className="px-1 font-semibold">
                            @stagewise/*
                          </code>{' '}
                          and{' '}
                          <code className="px-1 font-semibold">
                            @stagewise-plugins/*
                          </code>
                          ) from this project
                        </span>
                        <Button
                          variant="default"
                          size="sm"
                          className="ml-3 flex-shrink-0 justify-center gap-2"
                          onClick={() => {
                            window.parent.postMessage(
                              { command: 'copyUninstallCommand' },
                              '*',
                            );
                            posthog?.capture('copy_uninstall_command');
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                        >
                          {copied ? (
                            <CheckIcon className="h-4 w-4 text-green-500" />
                          ) : (
                            <CopyIcon className="h-4 w-4" />
                          )}
                          Copy agent instructions
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full max-w-md">
                  <p className="mb-6 text-center font-semibold text-lg text-zinc-700 dark:text-zinc-300">
                    2. Use the stagewise CLI
                  </p>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center gap-3">
                        <span className="text-start font-medium text-sm text-zinc-700 dark:text-zinc-300">
                          Simply run{' '}
                          <code className="px-1 font-semibold">
                            npx stagewise@latest -b
                          </code>{' '}
                          in the terminal in your project root.
                          <br />
                          (If you're using pnpm, run{' '}
                          <code className="px-1 font-semibold">
                            pnpm dlx stagewise@latest
                          </code>{' '}
                          instead.)
                        </span>
                        <Button
                          variant="default"
                          size="sm"
                          className="ml-3 flex-shrink-0 justify-center gap-2"
                          onClick={() => {
                            setTerminalStarted(true);
                            window.parent.postMessage(
                              { command: 'openTerminal' },
                              '*',
                            );
                          }}
                        >
                          {terminalStarted ? (
                            <CheckIcon className="h-4 w-4 text-green-500" />
                          ) : (
                            <TerminalIcon className="h-4 w-4" />
                          )}
                          Open terminal
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-16 dark:border-zinc-800">
        <ScrollReveal delay={1}>
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-6 font-bold text-2xl md:text-3xl">
              Got feedback?
            </h2>
            <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
              If you encounter any issues during migration, we're here to help.
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
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
