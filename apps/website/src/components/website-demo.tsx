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
          ? 'bg-blue-500 px-6 py-3 text-white'
          : 'rounded-full bg-black px-8 py-3 text-white'
      } font-medium ring-2 ring-blue-500 ring-offset-2`}
    >
      Download now
    </div>
  );
}

export function WebsiteDemo() {
  const [isLoading, setIsLoading] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [text, setText] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);
  const [showPopover, setShowPopover] = useState(true);

  const messages = [
    'make the button blue and remove the corner radius',
    'make the button rounded and black',
  ];

  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!showPopover) return;

    let currentIndex = 0;
    typingTimeout.current = setInterval(() => {
      if (currentIndex < messages[messageIndex].length) {
        setText(messages[messageIndex].slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        if (typingTimeout.current) clearInterval(typingTimeout.current);

        setIsLoading(true);

        setTimeout(() => {
          setIsActive((prev) => !prev); // toggle button
          setTimeout(() => {
            setShowPopover(false);
            setIsLoading(false);
            setTimeout(() => {
              setMessageIndex((prev) => (prev + 1) % messages.length);
              setText('');
              setShowPopover(true);
            }, 1000);
          }, 500);
        }, 2000);
      }
    }, 100);

    return () => {
      if (typingTimeout.current) clearInterval(typingTimeout.current);
    };
  }, [messageIndex, showPopover]);

  return (
    <div
      className={`w-full max-w-4xl rounded-lg border border-gray-200 bg-white shadow-lg transition-transform duration-500 ${
        isLoading ? 'scale-75' : 'scale-100'
      }`}
    >
      <div className="flex items-center justify-between border-gray-200 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-blue-500" />
          <div className="h-4 w-4 rounded-full bg-green-500" />
          <div className="h-4 w-4 rounded-full bg-yellow-500" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-4 w-20 rounded bg-gray-100" />
          <div className="h-4 w-4 rounded-full bg-gray-100" />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-6 border-gray-200 border-b px-6 py-3">
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-100" />
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="mb-6">
          <div className="mb-4 h-6 w-48 rounded bg-gray-100" />
          <div className="mb-2 h-4 w-3/4 rounded bg-gray-100" />
          <div className="mb-2 h-4 w-1/2 rounded bg-gray-100" />
          <div className="h-4 w-2/3 rounded bg-gray-100" />
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="h-10 w-32 rounded bg-gray-100" />
          <div className="relative">
            <ToggleButton isActive={isActive} />
            {showPopover && (
              <div className="-translate-x-1/2 sm:-translate-y-1/2 sm:-translate-x-0 absolute top-full left-1/2 z-10 mt-4 w-xs sm:top-1/2 sm:left-full sm:mt-0 sm:ml-4">
                <div className="h-20 rounded-lg bg-white p-4 shadow-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-full font-mono text-gray-700 text-sm">
                      {text}
                      <span className="animate-pulse">|</span>
                    </div>
                    <button
                      type="button"
                      disabled
                      className={`flex h-6 w-6 items-center justify-center rounded-full p-1 transition-colors ${
                        text === messages[messageIndex]
                          ? isLoading
                            ? 'bg-blue-100'
                            : 'bg-blue-500'
                          : 'bg-blue-500'
                      }`}
                    >
                      {isLoading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
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
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 h-4 w-24 rounded bg-gray-100" />
            <div className="mb-2 h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 h-4 w-24 rounded bg-gray-100" />
            <div className="mb-2 h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
