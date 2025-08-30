'use client';

import { useState } from 'react';
import { CopyIcon, CheckIcon, ChevronDownIcon } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { cn } from '@stagewise/ui/lib/utils';

type PackageManager = 'npm' | 'pnpm' | 'yarn';

const packageManagerCommands: Record<PackageManager, string> = {
  npm: 'npx stagewise@latest',
  pnpm: 'pnpm dlx stagewise@latest',
  yarn: 'yarn dlx stagewise@latest',
};

const packageManagerLabels: Record<PackageManager, string> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'Yarn',
};

export function PackageManagerClipboard({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const [selectedPM, setSelectedPM] = useState<PackageManager>('npm');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const posthog = usePostHog();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(packageManagerCommands[selectedPM]);
      setCopied(true);
      posthog?.capture('quickstart_toolbar_copy_click', {
        package_manager: selectedPM,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch (_e) {
      // Optionally handle error
    }
  };

  const handlePackageManagerSelect = (pm: PackageManager) => {
    setSelectedPM(pm);
    setDropdownOpen(false);
    posthog?.capture('package_manager_selected', { package_manager: pm });
  };

  return (
    <div className={cn('mb-4 flex w-full sm:w-auto', className)}>
      {/* Combined container with fully rounded corners */}
      <div className="glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive relative flex w-fit rounded-full bg-white/60 p-2 transition-all duration-200 dark:bg-zinc-900/60">
        {/* Dropdown for package manager selection */}
        <div className="relative">
          <button
            type="button"
            className="flex h-full items-center justify-center px-3 py-2 font-medium text-sm text-zinc-700 transition-all duration-200 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(!dropdownOpen);
            }}
            aria-label="Select package manager"
          >
            {packageManagerLabels[selectedPM]}
            <ChevronDownIcon className="ml-1 h-3 w-3" />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 z-50 mt-1 min-w-[80px] rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {Object.entries(packageManagerLabels).map(([pm, label]) => (
                  <button
                    key={pm}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-zinc-700 first:rounded-t-md last:rounded-b-md hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePackageManagerSelect(pm as PackageManager);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Code sample in inner glass-inset box */}
        <button
          type="button"
          className="glass-inset flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 transition-all duration-200"
          onClick={handleCopy}
          aria-label="Copy to clipboard"
        >
          <span className="select-all font-mono text-sm">
            {packageManagerCommands[selectedPM]}
          </span>
          {copied ? (
            <CheckIcon className="h-4 w-4 text-green-500" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
