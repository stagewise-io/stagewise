'use client';

import { useState } from 'react';
import { CopyIcon, CheckIcon } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

export function Clipboard({
  text,
}: {
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const posthog = usePostHog();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      posthog?.capture('quickstart_toolbar_copy_click');
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Optionally handle error
    }
  };

  return (
    <button
      type="button"
      className="mb-4 flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 p-4 dark:border-zinc-800 dark:bg-zinc-900"
      onClick={handleCopy}
      aria-label="Copy to clipboard"
    >
      <span className="select-all font-mono">{text}</span>
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-500" />
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
    </button>
  );
}
