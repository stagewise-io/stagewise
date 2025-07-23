'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import StagewiseLogo from '../../logo.svg';
import StagewiseLogoWhite from '../../logo-white.svg';

export function Footer() {
  const posthog = usePostHog();
  return (
    <footer className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-12 dark:border-zinc-800">
      <div className="flex flex-col items-center justify-between md:flex-row">
        <div className="mb-4 flex items-center gap-2 md:mb-0">
          <Image
            src={StagewiseLogo}
            alt="stagewise Logo"
            height={32}
            className="dark:hidden"
          />
          <Image
            src={StagewiseLogoWhite}
            alt="stagewise Logo"
            height={32}
            className="hidden dark:block"
          />
          <span className="ml-8 text-sm text-zinc-600 dark:text-zinc-500">
            © 2025 tiq UG (haftungsbeschränkt)
          </span>
        </div>
        <div className="flex gap-8">
          <Link
            href="https://github.com/stagewise-io/stagewise"
            className="group flex items-center text-zinc-900 transition-colors dark:text-white"
            target="_blank"
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
          stagewise® is a registered trademark of tiq UG (haftungsbeschränkt)
          and protected in the EU by the European Union Intellectual Property
          Office (EUIPO).
          <br />
          Unauthorized use is prohibited.
        </p>
        <div className="mt-4 flex gap-4 md:mt-0">
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
