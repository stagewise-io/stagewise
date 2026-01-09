'use client';

import Link from 'next/link';

import { ExternalLink } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

export function Footer() {
  const posthog = usePostHog();
  return (
    <footer className="relative z-10 mx-auto w-full max-w-6xl px-4 py-12">
      <div className="flex flex-col items-center justify-between md:flex-row">
        <div className="mb-4 flex items-center gap-2 md:mb-0">
          <span className="text-sm text-zinc-600 dark:text-zinc-500">
            © {new Date().getFullYear()} stagewise GmbH
          </span>
          <span className="text-zinc-400 dark:text-zinc-600">·</span>
          <a
            href="https://www.ycombinator.com/companies/stagewise"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-300"
            onClick={() =>
              posthog?.capture('footer_link_click', { destination: 'yc' })
            }
          >
            Backed by{' '}
            <span className="mx-1 inline-flex size-4 items-center justify-center bg-[#f26622] font-normal text-white text-xs">
              Y
            </span>
            <span className="font-normal text-[#f26622]">Combinator</span>
          </a>
        </div>
        <div className="flex gap-8">
          <Link
            href="https://github.com/stagewise-io/stagewise"
            className="group flex items-center text-zinc-900 transition-colors dark:text-white"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              posthog?.capture('footer_link_click', { destination: 'github' })
            }
          >
            GitHub
            <ExternalLink className="ml-1 h-3 w-3 opacity-100 transition-opacity" />
          </Link>
          <Link
            href="https://discord.gg/gkdGsDYaKA"
            className="group flex items-center text-zinc-900 transition-colors dark:text-white"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              posthog?.capture('footer_link_click', {
                destination: 'discord',
              })
            }
          >
            Discord
            <ExternalLink className="ml-1 h-3 w-3 opacity-100 transition-opacity" />
          </Link>
          <Link
            href="mailto:sales@stagewise.io"
            className="group flex items-center text-zinc-900 transition-colors dark:text-white"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              posthog?.capture('footer_link_click', {
                destination: 'contact',
              })
            }
          >
            Contact
            <ExternalLink className="ml-1 h-3 w-3 opacity-100 transition-opacity" />
          </Link>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center justify-between pt-8 md:flex-row dark:border-zinc-800">
        <p className="max-w-lg text-xs text-zinc-500 dark:text-zinc-400">
          stagewise® is a registered trademark of stagewise GmbH and protected
          in the EU by the European Union Intellectual Property Office (EUIPO).
          <br />
          Unauthorized use is prohibited.
        </p>
        <div className="mt-4 flex flex-col items-end gap-2 md:mt-0">
          <Link
            href="/terms"
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Privacy Policy
          </Link>
          <Link
            href="/legal-notice"
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Legal notice
          </Link>
          <Link
            href="/trademark-policy"
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Trademark Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
