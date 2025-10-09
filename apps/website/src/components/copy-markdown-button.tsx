'use client';

import { useState } from 'react';
import { CopyIcon, CheckIcon } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { cn } from '@/lib/utils';

export function CopyMarkdownButton({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const posthog = usePostHog();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      posthog?.capture('docs_copy_markdown_click');
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) {
      // Optionally handle error
    }
  };

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 font-medium text-sm text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100',
        className,
      )}
      onClick={handleCopy}
      aria-label="Copy page as markdown"
      title="Copy as markdown"
    >
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4 text-green-500" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <CopyIcon className="h-4 w-4" />
          <span>Copy as markdown</span>
        </>
      )}
    </button>
  );
}
