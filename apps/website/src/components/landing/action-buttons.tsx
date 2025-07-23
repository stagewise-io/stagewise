'use client';
import { VscVscode } from 'react-icons/vsc';

import { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';

import { cn } from '@stagewise/ui/lib/utils';
import { Button, buttonVariants } from '@stagewise/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@stagewise/ui/components/tooltip';
import { SiNpm } from 'react-icons/si';
import { usePostHog } from 'posthog-js/react';

export function ActionButtons() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <a
        href="https://marketplace.visualstudio.com/items?itemName=stagewise.toolbar"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          buttonVariants({ variant: 'default', size: 'lg' }),
          'bg-[#007ACC] text-white transition-colors hover:bg-[#0062a3]',
          'disabled:opacity-100',
        )}
      >
        <VscVscode className="h-5 w-5" />
        VS Code Extension
      </a>
      <CopyNPMInstallCommandButton />
    </div>
  );
}

export default function CopyNPMInstallCommandButton() {
  const [copied, setCopied] = useState<boolean>(false);
  const posthog = usePostHog();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText('npm install @stagewise/toolbar');
      posthog?.capture('quickstart_copy_npm_click');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="flex border-zinc-300 text-zinc-900 hover:bg-zinc-100 disabled:opacity-100 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800"
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy to clipboard'}
            disabled={copied}
            size="lg"
          >
            <SiNpm className="h-5 w-5" />
            npm install @stagewise/toolbar
            <div className="relative flex w-full justify-end">
              <div
                className={cn(
                  'transition-all',
                  copied ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
                )}
              >
                <CheckIcon
                  className="stroke-emerald-500"
                  size={16}
                  aria-hidden="true"
                />
              </div>
              <div
                className={cn(
                  'absolute flex w-full justify-end transition-all',
                  copied ? 'scale-0 opacity-0' : 'scale-100 opacity-100',
                )}
              >
                <CopyIcon size={16} aria-hidden="true" />
              </div>
            </div>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
          Click to copy
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
