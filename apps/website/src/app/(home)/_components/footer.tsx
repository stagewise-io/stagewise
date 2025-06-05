'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

export function Footer() {
  const posthog = usePostHog();
  return (
    <footer className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-12 dark:border-zinc-800">
      <div className="flex flex-col items-center justify-between md:flex-row">
        <div className="mb-4 flex items-center gap-2 md:mb-0">
          <Image
            src="/logo.png"
            alt="stagewise Logo"
            width={24}
            height={24}
            className="rounded-full"
          />
          <span className="font-semibold">stagewise</span>
          <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-500">
            © 2025 tiq UG (haftungsbeschränkt)
          </span>
        </div>
        <div className="flex gap-8">
          <Link
            href="https://github.com/stagewise-io/stagewise"
            className="group flex items-center text-slate-900 transition-colors dark:text-white"
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
            className="group flex items-center text-slate-900 transition-colors dark:text-white"
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
            className="group flex items-center text-slate-900 transition-colors dark:text-white"
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
            href="/imprint"
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Impressum
          </Link>
          <Link
            href="/docs/trademark-policy"
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Trademark Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
