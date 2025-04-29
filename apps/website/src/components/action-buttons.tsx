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

  const handleCopy = async () => {
    try {
      // await navigator.clipboard.writeText("string to copy");
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
            className="flex disabled:opacity-100"
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
        <TooltipContent className="px-2 py-1 text-xs">
          Click to copy
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
