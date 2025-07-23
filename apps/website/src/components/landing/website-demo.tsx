'use client';

import { useEffect, useRef, useState } from 'react';

interface ToggleButtonProps {
  isActive: boolean;
}

function ToggleButton({ isActive }: ToggleButtonProps) {
  return (
    <div
      className={`cursor-default select-none transition-all duration-300 ease-in-out ${
        isActive
          ? 'bg-black px-6 py-3 text-white'
          : 'rounded-full bg-black px-8 py-3 text-white'
      } font-medium ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-900`}
    >
      Download now
    </div>
  );
}

type Status = 'typing' | 'loading' | 'hidden';

export function WebsiteDemo() {
  const [status, setStatus] = useState<Status>('typing');
  const [isActive, setIsActive] = useState(false);
  const [text, setText] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = [
    'make the button indigo and remove the corner radius',
    'make the button rounded and black',
  ];

  const typingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (status !== 'typing') return;

    let currentIndex = 0;
    typingInterval.current = setInterval(() => {
      if (
        messageIndex < messages.length &&
        currentIndex < messages[messageIndex]!.length
      ) {
        setText(messages[messageIndex]!.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        if (typingInterval.current) clearInterval(typingInterval.current);

        setStatus('loading');
        setTimeout(() => {
          setIsActive((prev) => !prev); // Toggle the button style
          setTimeout(() => {
            setStatus('hidden');
            setTimeout(() => {
              setMessageIndex((prev) => (prev + 1) % messages.length);
              setText('');
              setStatus('typing'); // Restart the cycle
            }, 1000);
          }, 500);
        }, 2000);
      }
    }, 100);

    return () => {
      if (typingInterval.current) clearInterval(typingInterval.current);
    };
  }, [messageIndex, status]);

  return (
    <div className="w-full max-w-4xl rounded-lg border border-indigo-300/40 bg-zinc-50 shadow-lg transition-transform duration-500 dark:border-indigo-800/40 dark:bg-zinc-900 dark:shadow-[0_0_30px_rgba(128,90,213,0.2)]">
      {/* Browser Top Bar */}
      <div className="flex items-center justify-between border-zinc-200 border-b px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-indigo-500" />
          <div className="h-4 w-4 rounded-full bg-pink-500" />
          <div className="h-4 w-4 rounded-full bg-yellow-500" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-4 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
      <div className="flex items-center gap-6 border-zinc-200 border-b px-6 py-3 dark:border-zinc-800">
        <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="p-6">
        <div className="mb-6">
          <div className="mb-4 h-6 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mb-2 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mb-2 h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="h-10 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="relative">
            <ToggleButton isActive={isActive} />
            {status !== 'hidden' && (
              <div className="-translate-x-1/2 sm:-translate-y-1/2 sm:-translate-x-0 absolute top-full left-1/2 z-10 mt-4 w-xs sm:top-1/2 sm:left-full sm:mt-0 sm:ml-4">
                <div className="h-20 rounded-lg border border-indigo-300/40 bg-zinc-50 p-4 shadow-lg dark:border-indigo-800/30 dark:bg-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-full font-mono text-sm text-zinc-700 dark:text-zinc-300">
                      {text}
                      <span className="animate-pulse">|</span>
                    </div>
                    <button
                      type="button"
                      disabled
                      className={`flex h-6 w-6 items-center justify-center rounded-full p-1 transition-colors ${
                        status === 'loading' ? 'bg-indigo-900' : 'bg-black'
                      }`}
                    >
                      {status === 'loading' ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                      ) : (
                        <svg
                          className="h-4 w-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-indigo-300/40 dark:border-zinc-800 dark:bg-zinc-900 hover:dark:border-indigo-800/30">
            <div className="mb-2 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mb-2 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-indigo-300/40 dark:border-zinc-800 dark:bg-zinc-900 hover:dark:border-indigo-800/30">
            <div className="mb-2 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mb-2 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
