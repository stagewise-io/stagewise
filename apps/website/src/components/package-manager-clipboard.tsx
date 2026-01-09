'use client';

import { useState } from 'react';
import { CopyIcon, CheckIcon, ChevronDownIcon } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from '@stagewise/stage-ui/components/menu';

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

export function PackageManagerClipboard() {
  const [copied, setCopied] = useState(false);
  const [selectedPM, setSelectedPM] = useState<PackageManager>('npm');
  const posthog = usePostHog();

  const handleCopy = async () => {
    try {
      const command = packageManagerCommands[selectedPM];
      await navigator.clipboard.writeText(command);
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
    posthog?.capture('package_manager_selected', { package_manager: pm });
  };

  return (
    <div className="relative flex w-fit items-center gap-2 rounded-lg bg-zinc-100 p-2 transition-all duration-200 dark:bg-zinc-800">
      {/* Dropdown for package manager selection */}
      <div className="relative">
        <Menu>
          <MenuTrigger>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Select package manager"
            >
              {packageManagerLabels[selectedPM]}
              <ChevronDownIcon className="size-3" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {Object.entries(packageManagerLabels).map(([pm, label]) => (
              <MenuItem
                key={pm}
                onClick={() => {
                  handlePackageManagerSelect(pm as PackageManager);
                }}
              >
                {label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>

      {/* Code sample */}
      <button
        type="button"
        className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-white px-4 py-2 transition-all duration-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
      >
        <span className="select-all whitespace-nowrap font-mono text-sm">
          {packageManagerCommands[selectedPM]}
        </span>
        {copied ? (
          <CheckIcon className="h-4 w-4 text-green-500" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
